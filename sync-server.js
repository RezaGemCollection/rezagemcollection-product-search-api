const express = require('express');
const path = require('path');
const { syncShopifyToMySQL } = require('./shopify-to-mysql-sync');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'rezagemcollection';

// MySQL connection pool
let connectionPool;

// Initialize MySQL connection
async function initMySQL() {
  try {
    connectionPool = mysql.createPool({
      host: MYSQL_HOST,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    const connection = await connectionPool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
    
    return true;
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    return false;
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'sync-ui.html'));
});

// API endpoint to trigger sync
app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Sync request received');
    
    // Check if MySQL is connected
    if (!connectionPool) {
      const mysqlReady = await initMySQL();
      if (!mysqlReady) {
        return res.status(500).json({ 
          success: false, 
          error: 'MySQL connection failed' 
        });
      }
    }
    
    // Start the sync process
    const result = await syncShopifyToMySQL();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error('❌ Sync API error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API endpoint to get last sync information
app.get('/api/last-sync', async (req, res) => {
  try {
    if (!connectionPool) {
      const mysqlReady = await initMySQL();
      if (!mysqlReady) {
        return res.status(500).json({ error: 'MySQL connection failed' });
      }
    }
    
    const connection = await connectionPool.getConnection();
    
    try {
      const [rows] = await connection.execute(`
        SELECT * FROM sync_log 
        WHERE status = 'success' 
        ORDER BY sync_date DESC 
        LIMIT 1
      `);
      
      res.json({ 
        lastSync: rows.length > 0 ? rows[0] : null 
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Last sync API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get statistics
app.get('/api/stats', async (req, res) => {
  try {
    if (!connectionPool) {
      const mysqlReady = await initMySQL();
      if (!mysqlReady) {
        return res.status(500).json({ error: 'MySQL connection failed' });
      }
    }
    
    const connection = await connectionPool.getConnection();
    
    try {
      // Get total products count
      const [productRows] = await connection.execute('SELECT COUNT(*) as count FROM products');
      const totalProducts = productRows[0].count;
      
      // Get total variants count
      const [variantRows] = await connection.execute('SELECT COUNT(*) as count FROM product_variants');
      const totalVariants = variantRows[0].count;
      
      // Get last sync time
      const [syncRows] = await connection.execute(`
        SELECT sync_date FROM sync_log 
        WHERE status = 'success' 
        ORDER BY sync_date DESC 
        LIMIT 1
      `);
      
      const lastSyncTime = syncRows.length > 0 
        ? new Date(syncRows[0].sync_date).toLocaleDateString()
        : null;
      
      res.json({
        totalProducts,
        totalVariants,
        lastSyncTime
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Stats API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mysql: connectionPool ? 'connected' : 'disconnected'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize MySQL connection
    await initMySQL();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Sync server running on http://localhost:${PORT}`);
      console.log(`📊 Dashboard available at http://localhost:${PORT}`);
      console.log(`🔧 Health check at http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  if (connectionPool) {
    await connectionPool.end();
    console.log('✅ MySQL connections closed');
  }
  
  process.exit(0);
});

// Start the server
startServer();
