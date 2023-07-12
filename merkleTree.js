const crypto = require("crypto");

function calculateHash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

class MerkleTree {
  constructor(transactions) {
    this.tree = this.buildTree(transactions);
  }

  buildTree(transactions) {
    let tree = [];
    for (let i = 0; i < transactions.length; i++) {
      tree.push(calculateHash(JSON.stringify(transactions[i])));
    }

    let treeLayer = tree;
    while (treeLayer.length > 1) {
      treeLayer = this.calculateNextLayer(treeLayer);
      tree = treeLayer.concat(tree);
    }

    return tree;
  }

  calculateNextLayer(nodes) {
    let nextLayer = [];
    for (let i = 0; i < nodes.length; i += 2) {
      if (i + 1 < nodes.length) {
        nextLayer.push(calculateHash(nodes[i] + nodes[i + 1]));
      } else {
        nextLayer.push(calculateHash(nodes[i]));
      }
    }
    return nextLayer;
  }

  getMerkleRoot() {
    return this.tree[0];
  }
}

module.exports = MerkleTree;
