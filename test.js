const EC = require("elliptic").ec;
const ec = new EC("secp256k1");

const Block = require("./block.js").Block;
const Transaction = require("./block.js").Transaction;
const addBlockToChain = require("./chain.js").addBlockToChain;
const createNewBlock = require("./chain.js").createNewBlock;
const createAndAddTransaction = require("./chain.js").createAndAddTransaction;
const createDb = require("./chain.js").createDb;
const getWalletBalance = require("./chain.js").getWalletBalance;
const { minerAddress, TRANSACTION_FEE } = require("./config.json");

// Add your private keys here
const privateKeySender1 =
  "f63795f1f00944217faa57bf6965eec798e1f7a3261c7542424ca7526d3f7af200";
const privateKeySender2 =
  "dd648654b24a191bd70c236d88e90b2179a4f49a0908d86510ffe50732019d4a00";

function signTransaction(transaction, privateKey) {
  const key = ec.keyFromPrivate(privateKey);

  const signature = key.sign(transaction.calculateHash());
  transaction.signature = signature.toDER("hex");
}

async function testBlockchain() {
  console.log("Starting blockchain test...");
  await createDb("hello");

  try {
    // Create new block and add it to the chain
    let block1 = createNewBlock([], minerAddress);
    addBlockToChain(block1);

    // Create a transaction and sign it
    let transaction1 = new Transaction(
      "04227ea4320cfd7d50fd821b3cc66d7bcbd80a8806dc3e5ce90fba3c6594920c482d6360933fd149363d5d1177320e108d836165ae48ece6d9c54919565c2f0562",
      "044c5d25bd9c6b2798c0171013107cf114906fc941e6a055fcdce2abf5ea88ff73453c70f34c27e5bd92f7e96a6af22a87cba865d0e29bbf914a0ff9ff44b86883",
      90,
      TRANSACTION_FEE
    );
    signTransaction(transaction1, privateKeySender1);

    // Add the signed transaction to the block and mine it
    createAndAddTransaction(block1, transaction1, minerAddress);

    // Create another block and add it to the chain
    let block2 = createNewBlock([], minerAddress);
    addBlockToChain(block2);

    // Create another transaction and sign it
    let transaction2 = new Transaction(
      "044c5d25bd9c6b2798c0171013107cf114906fc941e6a055fcdce2abf5ea88ff73453c70f34c27e5bd92f7e96a6af22a87cba865d0e29bbf914a0ff9ff44b86883",
      "04a8bc99fdb9c5f8a2c1b1a6660ea96ba233317901a9927544c23de6a1926f3c8ffdb37e9ca7b3c8858289209cdea8fb6ff1b15daf7d508b0c859e0e9fea11f508",
      1.98899,
      TRANSACTION_FEE
    );
    signTransaction(transaction2, privateKeySender2);

    // Add the signed transaction to the second block and mine it
    createAndAddTransaction(block2, transaction2, minerAddress);

    console.log("All tests passed successfully.");
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

// Run the tests
testBlockchain();
