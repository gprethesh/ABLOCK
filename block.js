const crypto = require("crypto");
exports.BlockHeader = class BlockHeader {
  constructor(version, previousBlockHeader, merkleRoot, time, difficulty) {
    this.version = version;

    this.previousBlockHeader = previousBlockHeader;

    this.merkleRoot = merkleRoot;

    this.time = time;
    this.difficulty = difficulty;
  }
};

exports.Block = class Block {
  constructor(blockHeader, index, transactions, tx) {
    this.blockHeader = blockHeader;
    this.index = index;
    this.transactions = transactions;
    this.tx = tx;
    this.nonce = 0;
    this.blockHeader.merkleRoot = this.calculateMerkleRoot(transactions);
  }

  calculateMerkleRoot(transactions) {
    let transactionHashes = transactions.map((transaction) =>
      crypto
        .createHash("sha256")
        .update(JSON.stringify(transaction))
        .digest("hex")
    );

    while (transactionHashes.length > 1) {
      if (transactionHashes.length % 2 !== 0) {
        transactionHashes.push(transactionHashes[transactionHashes.length - 1]);
      }

      transactionHashes = this.pairwiseHash(transactionHashes);
    }

    return transactionHashes[0];
  }

  pairwiseHash(transactionHashes) {
    let newHashes = [];

    for (let i = 0; i < transactionHashes.length; i += 2) {
      newHashes.push(
        crypto
          .createHash("sha256")
          .update(transactionHashes[i] + transactionHashes[i + 1])
          .digest("hex")
      );
    }

    return newHashes;
  }
};

exports.Transaction = class Transaction {
  constructor(sender, receiver, amount, fee, signature, time, id) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = amount;
    this.signature = signature;
    this.fee = fee;
    this.time = time;
    this.id = id;
  }
  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(this.sender + this.receiver + this.amount + this.fee + this.time)
      .digest("hex");
  }
};
