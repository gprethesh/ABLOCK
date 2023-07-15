const crypto = require("crypto");
const Block = require("./block.js").Block;
const BlockHeader = require("./block.js").BlockHeader;
const Transaction = require("./block.js").Transaction;
const MerkleTree = require("./merkleTree.js");
const AsyncLock = require("async-lock");
const EC = require("elliptic").ec,
  ec = new EC("secp256k1");
const { Level } = require("level");
const fs = require("fs");
const path = require("path");
const levelup = require("levelup");
const leveldown = require("leveldown");

const { TRANSACTION_FEE, MINING_REWARD, MAX_SUPPLY } = require("./config.json");

const difficulty = 5;
const blockchain = [];
const lock = new AsyncLock();

let db;

let createDb = async (peerId) => {
  let dir = path.join(__dirname, "db", peerId);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    let levelDb = leveldown(dir);
    db = levelup(levelDb);
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

function calculateHashForTransaction(transaction) {
  return crypto
    .createHash("sha256")
    .update(
      transaction.sender +
        transaction.receiver +
        transaction.amount +
        transaction.fee
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

let storeBlock = (newBlock) => {
  db.put(newBlock.index, JSON.stringify(newBlock), function (err) {
    if (err) console.error("Error storing block:", err);
    else if (newBlock.index !== 0)
      console.log("--- Inserting block index: " + newBlock.index);
  });
};

async function validateTransfer(transaction) {
  if (transaction.sender === "genesis") {
    console.log(`Genesis Block detected`);
    await updateBalance(transaction.receiver, transaction.amount);
    return true;
  }
  const key = ec.keyFromPublic(transaction.sender, "hex");
  const validSignature = key.verify(
    calculateHashForTransaction(transaction),
    transaction.signature
  );
  console.log(`validSignature::`, validSignature);
  if (!validSignature) {
    console.log(
      `Invalid transaction from ${transaction.sender} due to invalid signature`
    );
    return false;
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
      return true;
    }
  } catch (err) {
    console.log(`Error fetching balance: `, err);
    return false;
  }
}

async function validateTransaction(transaction) {
  if (transaction.sender === "genesis") {
    console.log(`Genesis Block detected`);
    await updateBalance(transaction.receiver, transaction.amount);
    return true;
  }
  const key = ec.keyFromPublic(transaction.sender, "hex");
  const validSignature = key.verify(
    calculateHashForTransaction(transaction),
    transaction.signature
  );

  if (!validSignature) {
    console.log(
      `Invalid transaction from ${transaction.sender} due to invalid signature`
    );
    return false;
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

async function createAndAddTransaction(block, transaction, minerAddress) {
  try {
    await lock.acquire("transaction", async () => {
      try {
        let minerRewardTransaction = new Transaction(
          "system",
          minerAddress,
          transaction.fee
        );

        if (await validateTransaction(transaction)) {
          // Check if the total supply after the transaction and the fee would exceed the maximum supply
          let totalSupply = await getTotalSupply();
          if (totalSupply + transaction.amount + transaction.fee > MAX_SUPPLY) {
            console.log(
              "Error: This transaction would exceed the maximum supply of tokens"
            );
            return;
          }

          // Deduct the fee from the sender's balance
          let senderBalance = await getBalance(transaction.sender);
          await updateBalance(
            transaction.sender,
            senderBalance - transaction.fee
          );

          // Add the fee to the miner's balance
          let minerBalance = await getBalance(minerAddress);
          await updateBalance(minerAddress, minerBalance + transaction.fee);

          // Add the transactions to the block
          block.transactions.push(transaction);
          block.transactions.push(minerRewardTransaction);

          // Recalculate the Merkle root and mine the block
          block.blockHeader.merkleRoot = new MerkleTree(
            block.transactions
          ).getMerkleRoot();
          mineBlock(block, minerAddress);
        }
      } catch (error) {
        console.error("Error processing transaction:", error);
      }
    });
  } catch (error) {
    console.error("Error acquiring lock:", error);
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
        resolve(Number(balance));
      }
    });
  });
}

async function getTotalSupply() {
  let totalSupply = 0;

  // Create a read stream for the database
  let stream = db.createReadStream();

  // Listen for data events, which are emitted for each entry in the database
  stream.on("data", function (data) {
    // The key is the address and the value is the balance
    let balance = parseInt(data.value);
    totalSupply += balance;
  });

  // Return a promise that resolves with the total supply when the stream ends
  return new Promise((resolve, reject) => {
    stream.on("end", function () {
      resolve(totalSupply);
    });
    stream.on("error", function (err) {
      reject(err);
    });
  });
}

module.exports = {
  addBlockToChain: addBlockToChain,
  createNewBlock: createNewBlock,
  createAndAddTransaction: createAndAddTransaction,
  createDb: createDb,
  getWalletBalance: getWalletBalance,
  validateTransfer: validateTransfer,
};
