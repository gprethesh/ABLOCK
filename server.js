const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const express = require("express");
const bodyParser = require("body-parser");

const {
  createDb,
  addBlockToChain,
  createNewBlock,
  getWalletBalance,
  validateTransfer,
} = require("./chain.js");
const Transaction = require("./block.js").Transaction;

let transactionPool = [];

let MessageType = {
  REQUEST_BLOCK: "requestBlock",
  RECEIVE_NEXT_BLOCK: "receiveNextBlock",
  RECEIVE_NEW_BLOCK: "receiveNewBlock",
  REQUEST_ALL_REGISTER_MINERS: "requestAllRegisterMiners",
  REGISTER_MINER: "registerMiner",
  REGISTER_TRANSACTION: "transaction",
};

let initHttpServer = (port) => {
  let http_port = "80" + port.toString().slice(-2);
  const app = express();
  app.use(bodyParser.json());

  app.post("/transactions", async (req, res) => {
    console.log(`Hello someone called me`);
    try {
      const { sender, receiver, amount, signature } = req.body;

      if (!sender || !receiver || !amount || !signature) {
        throw new Error("Missing sender, receiver, amount, or signature");
      }
      const transaction = new Transaction(
        sender,
        receiver,
        amount,
        1,
        signature
      );

      const isValidTransaction = await validateTransfer(transaction);

      console.log(`isValidTransaction:`, isValidTransaction);

      if (!isValidTransaction) {
        return res.status(400).json({ error: "Invalid transaction" });
      }

      broadcastTransaction(transaction);
      addToTransactionPool(transaction);
      res.status(201).send("Transaction created");
    } catch (err) {
      res.status(500).json({
        error: "An error occurred while processing your request",
        details: err.message,
      });
    }
  });

  app.listen(http_port, () => console.log("Listening on port: " + http_port));
};

function getTransactionPool() {
  return transactionPool;
}

function addToTransactionPool(transaction) {
  transactionPool.push(transaction);
}

const id = crypto.randomBytes(32);
console.log("Your identity: " + id.toString("hex"));

let config = defaults({
  id: id,
});

let swarm = new Swarm(config);

const peers = {};
let connSeq = 0;

// create a database once you start the code
createDb(id.toString("hex"));

const run = async () => {
  const port = await getPort();
  initHttpServer(port);

  swarm.listen(port);
  console.log("P2P port: " + port);

  swarm.join("BOOST");
  swarm.on("connection", (conn, info) => {
    const seq = connSeq;
    const peerId = info.id.toString("hex");
    console.log(`Connected #${seq} to peer: ${peerId}`);

    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600);
      } catch (error) {
        console.log("Connection error", error);
      }
    }

    conn.on("data", async (data) => {
      let message;
      try {
        message = JSON.parse(data);
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
              message.data.signature
            );
            console.log(`inside switch case:`, transaction);
            const isValidTransaction = await validateTransfer(transaction);

            if (isValidTransaction) {
              console.table(`ADDED TO POOL`);
              addToTransactionPool(transaction);
            }
            break;

          case MessageType.REQUEST_BLOCK:
            // Handle request block case
            break;

          case MessageType.RECEIVE_NEXT_BLOCK:
            // Handle receive next block case
            break;

          case MessageType.RECEIVE_NEW_BLOCK:
            // Handle receive new block case
            break;

          case MessageType.REQUEST_ALL_REGISTER_MINERS:
            // Handle request all register miners case
            break;

          case MessageType.REGISTER_MINER:
            // Handle register miner case
            break;

          default:
            console.log(`Unknown message type: ${message.type}`);
            break;
        }
      } catch (err) {
        console.log(`Error handling data from peer ${peerId}:`, err.message);
      }
    });

    conn.on("close", () => {
      console.log(`Connection ${seq} closed, peerId: ${peerId}`);
      if (peers[peerId]?.seq === seq) {
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
    peers[id].conn.write(
      JSON.stringify({
        to: id,
        from: id.toString("hex"),
        type: type,
        data: data,
      })
    );
  }
}

run();
