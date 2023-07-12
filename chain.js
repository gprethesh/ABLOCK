const crypto = require("crypto");
const Block = require("./block.js").Block;
const BlockHeader = require("./block.js").BlockHeader;
const Transaction = require("./block.js").Transaction;
const MerkleTree = require("./merkleTree.js");
const { Level } = require("level");
const fs = require("fs");
const path = require("path");
const { TRANSACTION_FEE, MINING_REWARD } = require("./config.json");

const difficulty = 5;
const blockchain = [];

let db;

let createDb = async (peerId) => {
  let dir = path.join(__dirname, "db", peerId);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    db = new Level(dir);
    let genesisBlock = await createGenesisBlock();
    blockchain.push(genesisBlock);
    storeBlock(genesisBlock);
  } catch (err) {
    console.error("Error creating database:", err);
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

async function createGenesisBlock() {
  let timestamp = new Date().getTime();
  let previousBlockHeader = "0";
  let version = "1.0.0";
  let merkleRoot = "0";
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
  let amount = 100000; // or whatever amount you want to initialize with
  let transaction = new Transaction(sender, receiver, amount);

  // Add the transaction to the block
  let transactions = [transaction];

  let index = 0;
  let block = new Block(blockHeader, index, transactions);
  block.blockHeader.hash = calculateHashForBlock(block);

  await updateBalance(receiver, amount);

  return block;
}

async function mineBlock(block, minerAddress) {
  let hash = calculateHashForBlock(block);
  console.log(`Mining for hash`, hash);
  while (hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
    block.nonce++;
    hash = calculateHashForBlock(block);
  }

  block.blockHeader.hash = hash;
  let minerBalance = await getBalance(minerAddress);
  minerBalance = minerBalance || 0;
  await updateBalance(
    minerAddress,
    minerBalance + block.transactions.length * TRANSACTION_FEE
  );
}

function createNewBlock(transactions, minerAddress) {
  let coinbaseTransaction = new Transaction(
    "coinbase",
    minerAddress,
    MINING_REWARD
  );
  transactions.unshift(coinbaseTransaction); // Add the coinbase transaction at the beginning of the block's transactions
  let blockHeader = createNewBlockHeader(transactions);
  let index = blockchain.length;
  let newBlock = new Block(blockHeader, index, transactions);
  mineBlock(newBlock, minerAddress);
  return newBlock;
}

function createNewBlockHeader(transactions) {
  let timestamp = new Date().getTime();
  let version = "1.0.0";
  let previousBlockHeader = blockchain[blockchain.length - 1].blockHeader.hash;
  let merkleTree = new MerkleTree(transactions);
  let merkleRoot = merkleTree.getMerkleRoot();
  let difficulty = updateDifficulty();
  return new BlockHeader(
    version,
    previousBlockHeader,
    merkleRoot,
    timestamp,
    difficulty
  );
}

function updateDifficulty() {
  const targetBlockTime = 10000;
  const adjustmentFactor = 0.05;

  if (blockchain.length < 100 || blockchain.length % 100 !== 0) {
    return blockchain[blockchain.length - 1].blockHeader.difficulty;
  }

  let oldBlock = blockchain[blockchain.length - 100];

  let timeDifference =
    blockchain[blockchain.length - 1].blockHeader.time -
    oldBlock.blockHeader.time;

  let newDifficulty = blockchain[blockchain.length - 1].blockHeader.difficulty;
  if (timeDifference < targetBlockTime * 100) {
    newDifficulty += adjustmentFactor;
  } else if (timeDifference > targetBlockTime * 100) {
    newDifficulty -= adjustmentFactor;
  }

  return newDifficulty;
}

function isValidNewBlock(newBlock, previousBlock) {
  if (previousBlock.index + 1 !== newBlock.index) {
    console.log("Error: Invalid index");
    return false;
  } else if (
    previousBlock.blockHeader.hash !== newBlock.blockHeader.previousBlockHeader
  ) {
    console.log("Error: Invalid previous block header");
    return false;
  } else {
    let hash = calculateHashForBlock(newBlock);
    if (hash !== newBlock.blockHeader.hash) {
      console.log(`Error: Invalid hash: ${hash} ${newBlock.blockHeader.hash}`);
      return false;
    }
  }
  return true;
}

function addBlockToChain(newBlock) {
  if (isValidNewBlock(newBlock, blockchain[blockchain.length - 1])) {
    blockchain.push(newBlock);
    storeBlock(newBlock);
  } else {
    console.log("Error: Invalid block");
  }
}

// create a storeBlock method to store the new block
let storeBlock = (newBlock) => {
  db.put(newBlock.index, JSON.stringify(newBlock), function (err) {
    if (err) console.error("Error storing block:", err);
    else console.log("--- Inserting block index: " + newBlock.index);
  });
};

async function validateTransaction(transaction) {
  if (transaction.sender === "genesis") {
    console.log(`Genesis Block detected`);
    await updateBalance(transaction.receiver, transaction.amount);
    return true;
  }

  try {
    let senderBalance = await getBalance(transaction.sender);
    senderBalance = senderBalance || 0;
    if (transaction.amount + TRANSACTION_FEE > senderBalance) {
      console.log(
        `Invalid transaction from ${transaction.sender} due to insufficient funds`
      );
      return false;
    } else {
      await updateBalance(
        transaction.sender,
        senderBalance - transaction.amount - TRANSACTION_FEE
      );
      let receiverBalance = await getBalance(transaction.receiver);
      receiverBalance = receiverBalance || 0;
      await updateBalance(
        transaction.receiver,
        receiverBalance + transaction.amount
      );
      return true;
    }
  } catch (err) {
    console.log(`Error fetching balance: `, err);
    return false;
  }
}

function getBalance(user) {
  return new Promise((resolve, reject) => {
    db.get(user, function (err, balance) {
      if (err) {
        if (err.notFound) {
          resolve(0);
        } else {
          reject(err);
        }
      } else {
        resolve(parseInt(balance));
      }
    });
  });
}

function updateBalance(user, amount) {
  return new Promise((resolve, reject) => {
    db.put(user, amount, function (err) {
      if (err) {
        console.log(`Failed to update balance for ${user}: `, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function createAndAddTransaction(
  block,
  sender,
  receiver,
  amount,
  fee,
  minerAddress
) {
  let newTransaction = new Transaction(sender, receiver, amount);
  let minerRewardTransaction = new Transaction("system", minerAddress, fee);

  if (await validateTransaction(newTransaction)) {
    // Deduct the fee from the sender's balance
    let senderBalance = await getBalance(sender);
    await updateBalance(sender, senderBalance - fee);

    // Add the fee to the miner's balance
    let minerBalance = await getBalance(minerAddress);
    await updateBalance(minerAddress, minerBalance + fee);

    // Add the transactions to the block
    block.transactions.push(newTransaction);
    block.transactions.push(minerRewardTransaction);

    // Recalculate the Merkle root and mine the block
    block.blockHeader.merkleRoot = new MerkleTree(
      block.transactions
    ).getMerkleRoot();
    mineBlock(block, minerAddress);
  }
}

function getWalletBalance(walletAddress) {
  return new Promise((resolve, reject) => {
    db.get(walletAddress, function (err, balance) {
      if (err) {
        if (err.notFound) {
          console.log(`Wallet address ${walletAddress} does not exist.`);
          resolve(0);
        } else {
          reject(err);
        }
      } else {
        console.log(
          `The balance of wallet address ${walletAddress} is ${balance}.`
        );
        resolve(balance);
      }
    });
  });
}

module.exports = {
  addBlockToChain: addBlockToChain,
  createNewBlock: createNewBlock,
  createAndAddTransaction: createAndAddTransaction,
  createDb: createDb,
  getWalletBalance: getWalletBalance,
};
