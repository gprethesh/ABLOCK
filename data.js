const Hyperswarm = require("hyperswarm");
const SecretStream = require("@hyperswarm/secret-stream");
const chalk = require("chalk");
const hypercorecrypto = require("hypercore-crypto");
const crypto = require("crypto");
const getPort = require("get-port");
const express = require("express");
const bodyParser = require("body-parser");
const tp = require("./transactionPool");
const { minerAddress, TRANSACTION_FEE } = require("./config.json");
const CronJob = require("cron").CronJob;

const {
  createDb,
  addBlockToChain,
  createNewBlock,
  getWalletBalance,
  getLatestBlock,
  getDbBlock,
  getTotalSupply,
  blockchain,
  addBlockToChain2,
  getBlockHeight,
  validateTransfer,
  getBlockFromLevelDB,
  createAndAddTransaction,
  getTransaction,
} = require("./chain.js");
const Transaction = require("./block.js").Transaction;

let MessageType = {
  REQUEST_BLOCKCHAIN_HEIGHT: "requestBlockChainHeight",
  RECEIVE_BLOCKCHAIN_HEIGHT: "sendBlockChainHeight",
  REQUEST_BLOCK: "requestBlock",
  RECEIVE_NEXT_BLOCK: "receiveNextBlock",
  GET_NEW_BLOCK: "getNewBlock",
  BLOCK_FULL_SYNC: "blockFullSync",
  REQUEST_ALL_REGISTER_MINERS: "requestAllRegisterMiners",
  REGISTER_MINER: "registerMiner",
  REGISTER_TRANSACTION: "transaction",
};

let writeMessageToPeers, writeMessageToPeerToId;

let ENABLE_CHAIN_REQUEST = false;
let isMining = false;

let initHttpServer = (port) => {
  let http_port = "80" + port.toString().slice(-2);
  const app = express();
  app.use(bodyParser.json());

  app.post("/transactions", async (req, res) => {
    console.log(`PINNED ME`);
    try {
      const { sender, receiver, amount, signature, fee, time } = req.body;

      if (!sender || !receiver || !amount || !signature || !fee || !time) {
        throw new Error("Missing sender, receiver, amount, or signature");
      }

      const transaction = new Transaction(
        sender,
        receiver,
        amount,
        fee,
        signature,
        time
      );

      // Calculate the hash and assign it directly to the object
      transaction.id = transaction.calculateHash();

      console.log(transaction);

      const isValidTransaction = await validateTransfer(transaction);

      if (!isValidTransaction) {
        return res.status(400).json({ error: "Invalid transaction" });
      }

      broadcastTransaction(transaction);
      tp.addToTransactionPool(transaction);
      res.status(201).send("Transaction created");
    } catch (err) {
      res.status(500).json({
        error: "An error occurred while processing your request",
        details: err.message,
      });
    }
  });

  app.get("/mempool", async (req, res) => {
    console.log(`Called me`);
    res.send(tp.getTransactionPool());
  });

  //  Blocks service will be retrieving all of your blocks
  app.get("/blocks", (req, res) => res.send(JSON.stringify(blockchain)));

  app.get("/latestBlock", async (req, res) => {
    try {
      const block = await getLatestBlock();
      res.send(block);
    } catch (error) {
      res.status(500).send("Error: " + error.message);
    }
  });

  app.get("/totalSupply", async (req, res) => {
    try {
      const supply = await getTotalSupply();
      res.send({ supply: supply });
    } catch (error) {
      res.status(500).send("Error: " + error.message);
    }
  });

  // getBlock service will be retrieving one block based on an index
  app.get("/getBlock", async (req, res) => {
    console.log(`called`);
    let blockIndex = req.query.index;
    console.log(`blockIndex`, blockIndex);
    try {
      let block = await getBlockFromLevelDB(blockIndex);
      res.send(block);
    } catch (error) {
      res.status(500).send("Error: " + error.message);
    }
  });

  app.get("/getTransaction", async (req, res) => {
    let tnx = req.query.transaction;
    console.log(`getTransaction`, tnx);
    try {
      let transaction = await getTransaction(tnx);
      res.send(transaction);
    } catch (error) {
      res.status(500).send("Error: " + error.message);
    }
  });

  app.get("/getBlockHeight", async (req, res) => {
    try {
      let blockHeight = await getBlockHeight();
      res.send({ blockHeight: blockHeight });
    } catch (error) {
      res.status(500).send("Error: " + error.message);
    }
  });

  //  getDBBlock service will be retrieving a LevelDB database entry based on an index
  app.get("/getDBBlock", (req, res) => {
    let blockIndex = req.query.index;
    getDbBlock(blockIndex, res);
  });

  app.listen(http_port, () => console.log("Listening on port: " + http_port));
};

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

const keyPair = hypercorecrypto.keyPair();
console.log("Your identity: " + keyPair.publicKey.toString("hex"));

const swarm = new Hyperswarm({ keyPair });

const peers = {};
let connSeq = 0;

// create a database once you start the code
createDb("hello");

const run = async () => {
  console.log(`Function running`);
  const port = await getPort();
  initHttpServer(port);

  const topic = Buffer.alloc(32).fill("BITCOINX");

  swarm.on("connection", (conn, info) => {
    // Determine whether we're the initiator or the responder
    const isInitiator = info.client;

    // Create a SecretStream from the connection
    const secretStream = new SecretStream(isInitiator, conn);

    console.log(`Connection running`);
    const seq = connSeq;
    const peerId = info.publicKey.toString("hex");
    console.log(chalk.blue(`Connected #${seq} to peer: ${peerId}`));

    // console.log(`secretStream.initiator`, secretStream.isInitiator);

    if (secretStream.isInitiator) {
      try {
        conn.setKeepAlive(true, 600);
        console.log(`setKeepAlive`);
      } catch (error) {
        console.log("Connection error", error);
      }
    }

    // setTimeout(() => {
    //   if (ENABLE_CHAIN_REQUEST == false) {
    //     writeMessageToPeers(MessageType.REQUEST_BLOCKCHAIN_HEIGHT);
    //     console.log(`No blocks found so calling this method.`);
    //   }
    // }, 10000);

    secretStream.on("data", async (data) => {
      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
        console.log(
          chalk.green.bold("----------- Received Message start -------------")
        );
        console.log(
          chalk.blue.bold("from: ") + peerId.toString("hex"),
          chalk.magenta.bold("to: ") + message.to,
          chalk.cyan.bold("my: ") + keyPair.publicKey.toString("hex"),
          chalk.yellow.bold("type: ") + message.type
        );

        console.log(
          chalk.green.bold("----------- Received Message end -------------")
        );
      } catch (error) {
        console.log("Failed to parse message:", data);
        return;
      }

      try {
        switch (message.type) {
          case MessageType.REGISTER_TRANSACTION:
            const transaction = new Transaction(
              message.data.sender,
              message.data.receiver,
              message.data.amount,
              message.data.fee,
              message.data.signature,
              message.data.time
            );

            const isValidTransaction = await validateTransfer(transaction);

            if (isValidTransaction) {
              console.log(chalk.yellow("TRANSACTION ADDED TO POOL"));
              tp.addToTransactionPool(transaction);
            }
            break;

          case MessageType.REQUEST_BLOCKCHAIN_HEIGHT:
            console.log(`REQUEST_BLOCK_HEIGHT`);
            chalk.blue.bold("-----------REQUEST_BLOCK_HEIGHT-------------");
            const localBlockchainHeight1 = await getBlockHeight();
            writeMessageToPeerToId(
              peerId.toString("hex"),
              MessageType.RECEIVE_BLOCKCHAIN_HEIGHT,
              localBlockchainHeight1
            );
            console.log(`Block Height sent to`, peerId.toString("hex"));
            chalk.green.bold("-----------REQUEST_BLOCK_HEIGHT-------------");
            break;

          case MessageType.RECEIVE_BLOCKCHAIN_HEIGHT:
            chalk.green.bold(
              "-----------RECEIVE_BLOCKCHAIN_HEIGHT-------------"
            );
            const localBlockchainHeight = await getBlockHeight();
            const peerBlockchainHeight = message.data;

            console.log(`localBlockchainHeight`, localBlockchainHeight);
            console.log(`peerBlockchainHeight`, peerBlockchainHeight);

            if (localBlockchainHeight < peerBlockchainHeight) {
              const nextBlockIndex = localBlockchainHeight + 1;
              writeMessageToPeers(MessageType.REQUEST_BLOCK, nextBlockIndex);
              console.log(`Sending Blockchain Hegiht`);
            } else {
              console.log(
                chalk.green.bold("-----------BLOCK_SYNCED-------------")
              );
              ENABLE_CHAIN_REQUEST = true;
              job.start();
              console.log(`ENABLE_CHAIN_REQUEST::`, ENABLE_CHAIN_REQUEST);
              console.log(chalk.yellow.bold("Block Synced Successfully"));
              console.log(
                chalk.green.bold("-----------BLOCK_SYNCED-------------")
              );
            }
            chalk.green.bold(
              "-----------RECEIVE_BLOCKCHAIN_HEIGHT-------------"
            );
            break;

          case MessageType.REQUEST_BLOCK:
            console.log(
              chalk.green.bold("-----------REQUEST_BLOCK-------------")
            );

            const blockNumber = message.data;

            console.log(`blockNumber`, blockNumber);

            const block = await getBlockFromLevelDB(blockNumber); // Get block

            console.log(`block that sent`, block);

            writeMessageToPeerToId(
              peerId.toString("hex"),
              MessageType.RECEIVE_NEXT_BLOCK,
              block
            ); // Send block

            console.log(
              `LOG :: Sent block at position ${blockNumber} to ${peerId.toString(
                "hex"
              )}.`
            );

            console.log(
              chalk.green.bold("-----------REQUEST_BLOCK-------------")
            );

            break;

          case MessageType.RECEIVE_NEXT_BLOCK:
            console.log("-----------RECEIVE_NEXT_BLOCK-------------");
            // add to blockchain
            // if (message.data.index === 0) {
            //   addBlockToChain2(message.data);
            // } else {
            //   await addBlockToChain(message.data);
            // }
            await addBlockToChain(message.data);

            await delay(3000);
            writeMessageToPeers(MessageType.REQUEST_BLOCKCHAIN_HEIGHT);
            console.log("-----------RECEIVE_NEXT_BLOCK-------------");
            break;

          case MessageType.GET_NEW_BLOCK:
            if (ENABLE_CHAIN_REQUEST == true) {
              if (message.data.sender !== keyPair.publicKey.toString("hex")) {
                console.log("-----------RECEIVED_NEW_BLOCK-------------");
                // add to blockchain
                const newBlock = await addBlockToChain(message.data.block);
                if (newBlock) {
                  // Stop any ongoing mining process
                  isMining = false;
                  // Start mining a new block
                  job.start();
                }
                console.log(`ADDING TO BLOCKCHAIN`);
                console.log("-----------RECEIVED_NEW_BLOCK-------------");
              }
            }

            break;

          default:
            console.log(`Unknown message type: ${message.type}`);
            break;
        }
      } catch (err) {
        console.log(`Error handling data from peer ${peerId}:`, err.message);
      }
    });

    // secretStream.write("Hello from peer!");

    secretStream.on("close", () => {
      console.log(
        chalk.red.bold(`Connection ${seq} closed, peerId: ${peerId}`)
      );
      if (peers[peerId]?.seq === seq) {
        delete peers[peerId];
      }
    });

    secretStream.on("error", (error) => {
      console.error(`Error  ${error.message}`);
    });

    if (!peers[peerId]) {
      peers[peerId] = {};
    }
    peers[peerId].conn = conn;
    peers[peerId].seq = seq;
    peers[peerId].secretStream = secretStream; // store the secretStream
    connSeq++;
  });

  async function connectSwarm() {
    console.log("Joining topic:", topic.toString());
    const discovery = swarm.join(topic);
    await discovery.flushed();
    console.log("Topic announced on DHT");
    await swarm.flush();
  }

  // Call the async function
  connectSwarm();
};

function broadcastTransaction(transaction) {
  for (let peerId in peers) {
    try {
      sendMessage(peerId, "transaction", transaction);
    } catch (err) {
      console.log(
        `Error broadcasting transaction to peer ${peerId}:`,
        err.message
      );
    }
  }
}

function sendMessage(id, type, data) {
  if (peers[id]) {
    const message = JSON.stringify({
      to: id,
      from: keyPair.publicKey.toString("hex"),
      type: type,
      data: data,
    });

    peers[id].secretStream.write(message);
  }
}

writeMessageToPeers = (type, data) => {
  for (let id in peers) {
    console.log("-------- writeMessageToPeers start -------- ");
    console.log("type: " + type + ", to: " + id);
    console.log("-------- writeMessageToPeers end ----------- ");
    sendMessage(id, type, data);
  }
};

writeMessageToPeerToId = (toId, type, data) => {
  for (let id in peers) {
    if (id === toId) {
      console.log("-------- writeMessageToPeerToId start -------- ");
      console.log("type: " + type + ", to: " + toId);
      console.log("-------- writeMessageToPeerToId end ----------- ");
      sendMessage(id, type, data);
    }
  }
};

const job = new CronJob("*/60 * * * * *", async function () {
  console.log(`CORN JOB CALLED`);
  isMining = true;
  if (isMining) {
    console.log(chalk.green.bold("-----------MINE_BLOCK-------------"));
    const transaction1 = tp.getTransactionPool();
    let block1 = await createNewBlock([], minerAddress);

    console.log(`blockXXX`, block1);
    await createAndAddTransaction(block1, [], minerAddress);
    try {
      const info = await addBlockToChain(block1);
      console.log(`info`, info);

      if (info) {
        console.log(chalk.blue.bold("-----------BROADCAST_BLOCK-------------"));
        writeMessageToPeers(MessageType.GET_NEW_BLOCK, {
          block: info,
          sender: keyPair.publicKey.toString("hex"),
        });
        console.log(chalk.blue.bold("-----------BROADCAST_BLOCK-------------"));
      }
    } catch (error) {
      console.log("An error occurred while adding the block:", error);
    }

    console.log(chalk.green.bold("-----------MINE_BLOCK-------------"));

    console.log(`CORN JOB OFF`);
  }
});

// job.start();

// olk

run();
