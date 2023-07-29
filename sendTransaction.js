const axios = require("axios");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const Transaction = require("./block.js").Transaction;
const { minerAddress, TRANSACTION_FEE } = require("./config.json");

function signTransaction(transaction, privateKey) {
  const key = ec.keyFromPrivate(privateKey);

  const signature = key.sign(transaction.calculateHash());
  transaction.signature = signature.toDER("hex");
  return transaction.signature;
}

const privateKeySender1 =
  "f63795f1f00944217faa57bf6965eec798e1f7a3261c7542424ca7526d3f7af2";

async function sendTransaction(sender, receiver, amount, fee, signature, time) {
  const transaction = {
    sender: sender,
    receiver: receiver,
    amount: amount,
    fee: fee,
    signature: signature,
    time: time,
  };

  try {
    const response = await axios.post(
      "http://localhost:8032/transactions",
      transaction
    );
    console.log(response.data);
  } catch (error) {
    console.error(`Failed to send transaction: ${error}`);
  }
}

// Create a transaction and sign it
let transaction1 = new Transaction(
  "04227ea4320cfd7d50fd821b3cc66d7bcbd80a8806dc3e5ce90fba3c6594920c482d6360933fd149363d5d1177320e108d836165ae48ece6d9c54919565c2f0562",
  "044c5d25bd9c6b2798c0171013107cf114906fc941e6a055fcdce2abf5ea88ff73453c70f34c27e5bd92f7e96a6af22a87cba865d0e29bbf914a0ff9ff44b86883",
  100,
  TRANSACTION_FEE,
  null,
  new Date().getTime()
);

console.log(`transaction1`, transaction1);

let signature = signTransaction(transaction1, privateKeySender1);

console.log(`signature`, signature);

sendTransaction(
  transaction1.sender,
  transaction1.receiver,
  transaction1.amount,
  transaction1.fee,
  signature,
  transaction1.time
);
