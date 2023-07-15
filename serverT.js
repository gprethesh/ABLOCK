const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const express = require("express");
const app = express();
app.use(express.json());

const {
  createDb,
  addBlockToChain,
  createNewBlock,
  getWalletBalance,
} = require("./chain.js");
const Transaction = require("./block.js").Transaction;

// Unique ID for the peer
const id = crypto.randomBytes(32);
console.log("Your identity: " + id.toString("hex"));

// Create a LevelDB database for the blockchain
createDb(id.toString("hex"));

// Join the P2P network
let config = defaults({
  id: id,
});

let swarm = new Swarm(config);

const peers = {};
let connSeq = 0;

let MessageType = {
  REQUEST_BLOCK: "requestBlock",
  RECEIVE_NEXT_BLOCK: "receiveNextBlock",
  RECEIVE_NEW_BLOCK: "receiveNewBlock",
  REQUEST_ALL_REGISTER_MINERS: "requestAllRegisterMiners",
  REGISTER_MINER: "registerMiner",
  REGISTER_TRANSACTION: "transaction",
};

// HTTP Server
app.get("/blocks", (req, res) => {
  // Retrieve all blocks from the blockchain
  res.json(blockchain);
});

app.get("/blocks/:index", (req, res) => {
  // Retrieve a specific block from the blockchain
  const block = blockchain[parseInt(req.params.index)];
  if (block) {
    res.json(block);
  } else {
    res.status(404).send("Block not found");
  }
});

app.post("/transactions", async (req, res) => {
  const { sender, receiver, amount } = req.body;
  const transaction = new Transaction(sender, receiver, amount);
  const block = createNewBlock([transaction], minerAddress);
  addBlockToChain(block);
  res.status(201).send("Transaction created");
});

app.get("/wallet/:address/balance", async (req, res) => {
  const balance = await getWalletBalance(req.params.address);
  res.json({ balance });
});

let transactionPool = [];
let registeredMiners = [];

function getTransactionPool() {
  // Return all transactions in the transaction pool
  return transactionPool;
}

function addToTransactionPool(transaction) {
  // Add a transaction to the transaction pool
  transactionPool.push(transaction);
}

function registerMiner(minerId) {
  // Register a miner by adding their ID to the list of registered miners
  registeredMiners.push(minerId);
}

function getAllRegisteredMiners() {
  // Return all registered miners
  return registeredMiners;
}

// P2P Network
const run = async () => {
  const port = await getPort();

  swarm.listen(port);
  console.log("Listening port: " + port);

  swarm.join("BOOST");
  swarm.on("connection", (conn, info) => {
    const seq = connSeq;
    const peerId = info.id.toString("hex");
    console.log(`Connected #${seq} to peer: ${peerId}`);

    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600);
      } catch (error) {
        console.log("error", error);
      }
    }

    conn.on("data", (data) => {
      // Handle incoming messages based on their type
      let message;
      try {
        message = JSON.parse(data);
      } catch (error) {
        console.log("Failed to parse message:", data);
        return;
      }

      switch (message.type) {
        case MessageType.REQUEST_BLOCK:
          // Send the requested block to the peer
          const requestedBlock = blockchain[message.data.index];
          if (requestedBlock) {
            const response = JSON.stringify({
              type: MessageType.RECEIVE_NEXT_BLOCK,
              data: requestedBlock,
            });
            conn.write(response);
          }
          break;
        case MessageType.RECEIVE_NEXT_BLOCK:
          // Add the received block to the blockchain
          addBlockToChain(message.data);
          break;
        case MessageType.RECEIVE_NEW_BLOCK:
          // Validate the received block and add it to the blockchain
          if (
            isValidNewBlock(message.data, blockchain[blockchain.length - 1])
          ) {
            addBlockToChain(message.data);
          }
          break;
        case MessageType.REQUEST_ALL_REGISTER_MINERS:
          // Send a list of all registered miners to the peer
          const miners = getAllRegisteredMiners(); // Assuming this function exists
          const response = JSON.stringify({
            type: MessageType.REGISTER_MINER,
            data: miners,
          });
          conn.write(response);
          break;
        case MessageType.REGISTER_MINER:
          // Register the miner and broadcast the updated list of miners
          registerMiner(message.data); // Assuming this function exists
          const updatedMiners = getAllRegisteredMiners(); // Assuming this function exists
          const broadcast = JSON.stringify({
            type: MessageType.REGISTER_MINER,
            data: updatedMiners,
          });
          for (let peerId in peers) {
            peers[peerId].conn.write(broadcast);
          }
          break;
        case MessageType.REGISTER_TRANSACTION:
          // Validate the transaction and add it to the transaction pool
          const isValid = validateTransaction(message.data); // Assuming this function exists
          if (isValid) {
            addToTransactionPool(message.data); // Assuming this function exists
          }
          break;
      }
    });

    conn.write("Hello, peer!");

    conn.on("close", () => {
      console.log(`Connection ${seq} closed, peerId: ${peerId}`);
      if (peers[peerId].seq === seq) {
        delete peers[peerId];
      }
    });

    if (!peers[peerId]) {
      peers[peerId] = {};
    }
    peers[peerId].conn = conn;
    peers[peerId].seq = seq;
    connSeq++;
  });

  // Register as a miner after a short delay
  setTimeout(() => {
    // Broadcast a message to all peers to register as a miner
    const message = JSON.stringify({
      type: MessageType.REGISTER_MINER,
      data: id,
    });
    for (let peerId in peers) {
      peers[peerId].conn.write(message);
    }
  }, 5000);

  // Mine blocks every 10 seconds
  setInterval(() => {
    // Mine a block, add it to the blockchain, and broadcast it
    const transactionPool = getTransactionPool(); // Assuming this function exists
    if (transactionPool.length > 0) {
      const block = createNewBlock(transactionPool, id);
      addBlockToChain(block);
      const message = JSON.stringify({
        type: MessageType.RECEIVE_NEW_BLOCK,
        data: block,
      });
      for (let peerId in peers) {
        peers[peerId].conn.write(message);
      }
    }
  }, 10000);
};

run();

const port = getPort();

app.listen(port, () => console.log("HTTP Server running on port 3000"));
