let transactionPool = [];

function addToTransactionPool(transaction) {
  console.log(`Added to Pool`);
  transactionPool.push(transaction);
}

function getTransactionPool() {
  return transactionPool;
}

function removeTransactions(transactionsToRemove) {
  transactionPool = transactionPool.filter(
    (tpTransaction) =>
      !transactionsToRemove.some(
        (rtTransaction) => rtTransaction.id === tpTransaction.id
      )
  );
}

function getTransactionPool() {
  return transactionPool;
}

module.exports = {
  addToTransactionPool,
  removeTransactions,
  getTransactionPool,
};
