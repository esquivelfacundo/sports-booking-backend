const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories
} = require('../controllers/expenseController');

// All routes require authentication
router.use(authenticateToken);

// Get expense categories
router.get('/categories', getExpenseCategories);

// Get expenses for an establishment
router.get('/establishment/:establishmentId', getExpenses);

// Create a new expense
router.post('/', createExpense);

// Update an expense
router.put('/:id', updateExpense);

// Delete an expense
router.delete('/:id', deleteExpense);

module.exports = router;
