const Block = require("./block.js").Block;
const BlockHeader = require("./block.js").BlockHeader;
const Transaction = require("./block.js").Transaction;
const MerkleTree = require("./merkleTree.js");
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
const miningState = require("./miningState");
const levelup = require("levelup");
const leveldown = require("leveldown");

const path = require("path");
const fs = require("fs");

let db;
const difficulty = 0x10;

let createDb = async (peerId) => {
  let dir = path.join(__dirname, "db", peerId);
  try {
    await fs.promises.access(dir, fs.constants.F_OK);
    // If the code reaches here, it means that the directory exists.
    let levelDb = leveldown(dir);
    db = levelup(levelDb);
  } catch (err) {
    if (err.code === "ENOENT") {
      // If the directory does not exist, create it.
      await fs.promises.mkdir(dir, { recursive: true });
      let levelDb = leveldown(dir);
      db = levelup(levelDb);
      let genesisBlock = await createGenesisBlock();
      blockchain.push(genesisBlock);
      storeBlock(genesisBlock);
      console.log(`Genesis Block Created.`, genesisBlock);
    } else {
      // Some other error occurred.
      console.error("Error creating or opening database:", err);
    }
  }
};

function calculateHashForBlock(block) {
  return crypto
    .createHash("sha256")
    .update(
      block.blockHeader.version +
        block.blockHeader.previousBlockHeader +
        block.blockHeader.merkleRoot +
        block.blockHeader.time +
        block.nonce
    )
    .digest("hex");
}
async function getBlockFromLevelDB(index) {
  return new Promise((resolve, reject) => {
    db.get("block_" + index, function (err, value) {
      if (err) {
        if (err.type === "NotFoundError") {
          resolve(undefined);
        } else {
          console.log("Block " + index + " get failed", err);
          reject(err);
        }
      } else {
        resolve(JSON.parse(value));
      }
    });
  });
}

let getBlockHeight = async () => {
  return new Promise((resolve, reject) => {
    let height = 0;
    db.createReadStream()
      .on("data", function (data) {
        if (data.key.toString().startsWith("block_")) {
          height++;
        }
      })
      .on("error", function (err) {
        console.error("Error reading data stream:", err);
        reject(err);
      })
      .on("end", function () {
        resolve(height - 1); // Subtract 1 to match the highest block index
      });
  });
};

async function createGenesisBlock() {
  let timestamp = 1690365924213;
  let previousBlockHeader = "0";
  let version = "1.0.0";
  let merkleRoot =
    "bb77e380f6d0ae7a842dc47a11b4d6a46523b05295eb86d4a583e59b90c1cbb5";
  let blockHeader = new BlockHeader(
    version,
    previousBlockHeader,
    merkleRoot,
    timestamp
  );

  // Create a transaction
  let sender = "genesis";
  let receiver =
    "04227ea4320cfd7d50fd821b3cc66d7bcbd80a8806dc3e5ce90fba3c6594920c482d6360933fd149363d5d1177320e108d836165ae48ece6d9c54919565c2f0562";
  let amount = 100000;
  let transaction = new Transaction(sender, receiver, amount);

  // Add the transaction to the block
  let transactions = [transaction];

  let index = 0;
  let block = new Block(blockHeader, index, transactions);
  block.blockHeader.hash = calculateHashForBlock(block);

  await updateBalance(receiver, amount);

  return block;
}

async function updateDifficulty() {
  console.log(`called function`);
  const targetBlockTime = 20000; // Target time per block in milliseconds
  const TARGET_BLOCK_INTERVAL = 2; // Number of blocks for difficulty adjustment

  // Add a default difficulty value for the first block.
  let defaultDifficulty = difficulty;

  let blockHeight = await getBlockHeight();

  console.log(`blockHeight`, blockHeight);

  // If there are no blocks in the blockchain, return the default difficulty.
  if (blockHeight === 0) {
    console.log(`return because no block ?`);
    return defaultDifficulty;
  }

  if (
    blockHeight < TARGET_BLOCK_INTERVAL ||
    blockHeight % TARGET_BLOCK_INTERVAL !== 0
  ) {
    console.log(`inside the block`);
    let lastBlock = await getBlockFromLevelDB(blockHeight - 1);

    return lastBlock.blockHeader.difficulty;
  }

  let oldBlock = await getBlockFromLevelDB(blockHeight - TARGET_BLOCK_INTERVAL);
  let lastBlock = await getBlockFromLevelDB(blockHeight - 1);

  let timeDifference = lastBlock.blockHeader.time - oldBlock.blockHeader.time;
  console.log(`timeDifference`, timeDifference);

  // Calculate the new difficulty
  let newDifficulty = lastBlock.blockHeader.difficulty;
  let idealTime = targetBlockTime * TARGET_BLOCK_INTERVAL;
  let ratio = idealTime / timeDifference;

  newDifficulty = Math.round(newDifficulty * ratio);

  console.log(`newDifficulty`, newDifficulty);

  // Convert newDifficulty to hexadecimal
  let newDifficultyHex = "0x" + newDifficulty.toString(16);

  console.log(`newDifficulty in hexadecimal`, newDifficultyHex);

  return newDifficultyHex;
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

    secretStream.on("data", async (data) => {});

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

const jobx = new CronJob("*/20 * * * * *", async function () {
  console.log(`inside cornJob`);
  const data = await updateDifficulty();
  console.log(`data`, data);
});

jobx.start();

run();
