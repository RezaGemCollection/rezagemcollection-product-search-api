const express = require('express');
const mysql = require('mysql2/promise');

// Configuration - SECURE VERSION
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MYSQL_HOST = process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost';
const MYSQL_USER = process.env.MYSQLUSER || process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'rezagemcollection';
const MYSQL_PORT = process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306;

// Performance optimizations - In-memory caching
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let gemstoneCache = {
  data: null,
  timestamp: 0,
  correctedNames: new Map() // Cache corrected gemstone names
};
let mysqlCache = {
  data: null,
  timestamp: 0
};

// MySQL connection pool
let connectionPool;

// Fuzzy matching configuration
const FUZZY_THRESHOLD = 0.6; // Lower = more strict, Higher = more lenient
const FUZZY_DISTANCE = 2; // Maximum edit distance for fuzzy matching

// Initialize MySQL connection
async function initMySQL() {
  try {
    if (!connectionPool) {
      connectionPool = mysql.createPool({
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
    }
    
    // Test connection
    const connection = await connectionPool.getConnection();
    
    // Create products table if it doesn't exist
    await createProductsTable(connection);
    
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    return false;
  }
}

// Function to create products table if it doesn't exist
async function createProductsTable(connection) {
  try {
    // Create products table
    const createProductsTableSQL = `
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        tags TEXT,
        image_url VARCHAR(500),
        image_alt VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_title (title(100)),
        INDEX idx_tags (tags(100)),
        FULLTEXT INDEX idx_search (title, description, tags)
      )
    `;
    
    await connection.execute(createProductsTableSQL);
    console.log('✅ Products table created/verified successfully');
    
    // Create product_variants table
    const createVariantsTableSQL = `
      CREATE TABLE IF NOT EXISTS product_variants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        price DECIMAL(10,2),
        inventory_quantity INT DEFAULT 0,
        available_for_sale BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product_id (product_id),
        INDEX idx_price (price),
        INDEX idx_available (available_for_sale)
      )
    `;
    
    await connection.execute(createVariantsTableSQL);
    console.log('✅ Product variants table created/verified successfully');
    
    // Check if products table is empty and add sample data
    const [productRows] = await connection.execute('SELECT COUNT(*) as count FROM products');
    if (productRows[0].count === 0) {
      await addSampleProducts(connection);
      console.log('✅ Sample products added to database');
    }
    
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  }
}

// Function to add sample products
async function addSampleProducts(connection) {
  try {
    const sampleProducts = [
      {
        id: 'ruby-001',
        title: 'Ruby Gemstone',
        description: 'Beautiful red ruby gemstone with excellent clarity',
        tags: 'ruby,red,gemstone,precious',
        image_url: 'https://example.com/ruby.jpg',
        image_alt: 'Ruby Gemstone'
      },
      {
        id: 'sapphire-001',
        title: 'Sapphire Crystal',
        description: 'Stunning blue sapphire with deep color',
        tags: 'sapphire,blue,gemstone,precious',
        image_url: 'https://example.com/sapphire.jpg',
        image_alt: 'Sapphire Crystal'
      },
      {
        id: 'emerald-001',
        title: 'Emerald Stone',
        description: 'Vibrant green emerald with natural inclusions',
        tags: 'emerald,green,gemstone,precious',
        image_url: 'https://example.com/emerald.jpg',
        image_alt: 'Emerald Stone'
      }
    ];
    
    for (const product of sampleProducts) {
      await connection.execute(
        'INSERT INTO products (id, title, description, tags, image_url, image_alt) VALUES (?, ?, ?, ?, ?, ?)',
        [product.id, product.title, product.description, product.tags, product.image_url, product.image_alt]
      );
      
      // Add variant for each product
      await connection.execute(
        'INSERT INTO product_variants (product_id, title, price, inventory_quantity, available_for_sale) VALUES (?, ?, ?, ?, ?)',
        [product.id, product.title, 99.99, 10, true]
      );
    }
    
  } catch (error) {
    console.error('❌ Error adding sample products:', error.message);
  }
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Reza Gem Collection Webhook is running',
    timestamp: new Date().toISOString()
  });
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  // Set timeout to prevent hanging requests
  const timeout = setTimeout(() => {
    console.log('⏰ Request timeout - taking too long');
    res.status(408).json({
      fulfillment_response: {
        messages: [{
          text: {
            text: ['Sorry, the request is taking too long. Please try again.']
          }
        }]
      }
    });
  }, 25000); // 25 second timeout

  try {
    // Get the full text from Dialogflow CX (no parameters needed)
    const text = req.body.text || req.body.queryText || req.body.queryResult?.queryText || '';
    
    console.log('Received text from Dialogflow CX:', text);
    console.log('Configuration check:', {
      gemini: GEMINI_API_KEY ? 'SET' : 'NOT SET',
      mysql: MYSQL_HOST ? 'SET' : 'NOT SET'
    });

    if (!text) {
      clearTimeout(timeout);
      return res.status(400).json({
        fulfillment_response: {
          messages: [{
            text: {
              text: ['Please tell me what products you are looking for.']
            }
          }]
        }
      });
    }

    // Step 1: Preprocess with Gemini to validate/correct gemstone keywords
    console.log('🔍 Step 1: Preprocessing with Gemini...');
    const correctedText = await preprocessWithGemini(text);
    console.log('✅ Gemini preprocessing result:', { original: text, corrected: correctedText });

    // Step 2: Split corrected words and search MySQL
    const words = correctedText.toLowerCase().split(' ').filter(word => word.length > 2);
    console.log('🔍 Step 2: Searching for words:', words);

    // Step 3: Query MySQL products using corrected words (with caching)
    const products = await queryMySQLProducts(words);

    // Format response for Dialogflow CX
    const response = {
      fulfillment_response: {
        messages: [{
          text: {
            text: [products]
          }
        }]
      }
    };

    clearTimeout(timeout);
    res.status(200).json(response);

  } catch (error) {
    clearTimeout(timeout);
    console.error('Error:', error);
    res.status(500).json({
      fulfillment_response: {
        messages: [{
          text: {
            text: ['Sorry, I encountered an error while searching for products. Please try again.']
          }
        }]
      }
    });
  }
});

// Function to preprocess text with Gemini (with caching)
async function preprocessWithGemini(text) {
  console.log('🔍 Starting Gemini preprocessing for text:', text);
  
  if (!GEMINI_API_KEY) {
    console.log('⚠️ No Gemini API key, skipping Gemini preprocessing');
    return text;
  }
  
  console.log('✅ Gemini API key found, proceeding with preprocessing');

  // Check cache first for corrected names
  const cacheKey = text.toLowerCase().trim();
  if (gemstoneCache.correctedNames.has(cacheKey)) {
    console.log('💾 Using cached correction:', gemstoneCache.correctedNames.get(cacheKey));
    return gemstoneCache.correctedNames.get(cacheKey);
  }
  
  console.log('🔄 No cache hit, calling Gemini API...');

  try {
    const prompt = `You are a gemstone expert. Analyze this user query about gemstone beads and jewelry.

User query: "${text}"

Your task:
1. Identify if this is gemstone/jewelry related
2. If YES: Correct any typos in gemstone names, sizes, or jewelry terms
3. If NO: Return "not gemstone related"
4. Return ONLY the corrected keywords, no explanations or extra text

Examples:
- "amethist" → "amethyst"
- "labradoright" → "labradorite" 
- "8mm amethist beads" → "8mm amethyst beads"
- "hello how are you" → "not gemstone related"

Return ONLY the corrected text or "not gemstone related".`;

    console.log('📤 Sending request to Gemini API...');
    console.log('🔑 Using API key:', GEMINI_API_KEY.substring(0, 10) + '...');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: 50, // Reduced to prevent extra commentary
          temperature: 0.1
        }
      })
    });

    console.log('📥 Gemini API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📊 Gemini API response data received');
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      const correctedText = data.candidates[0].content.parts[0].text.trim();
      console.log('✅ Gemini response parsed successfully');
      console.log('🤖 Raw Gemini response:', correctedText);
      
      // If Gemini says it's not gemstone related, return original text
      if (correctedText.toLowerCase().includes('not gemstone related')) {
        console.log('🤖 Gemini: Query not gemstone related, using original text');
        gemstoneCache.correctedNames.set(cacheKey, text);
        return text;
      }

      console.log('🤖 Gemini: Corrected gemstone keywords');
      
      // Cache the correction
      gemstoneCache.correctedNames.set(cacheKey, correctedText);
      
      return correctedText;
    } else {
      console.error('❌ Unexpected Gemini response structure:', JSON.stringify(data, null, 2));
      throw new Error('Unexpected Gemini response structure');
    }

  } catch (error) {
    console.error('❌ Gemini preprocessing error:', error);
    console.log('⚠️ Falling back to original text');
    return text; // Fallback to original text if Gemini fails
  }
}

// Function to query MySQL products (with caching)
async function queryMySQLProducts(searchWords) {
  // Check cache first
  const now = Date.now();
  if (mysqlCache.data && (now - mysqlCache.timestamp) < CACHE_DURATION) {
    console.log('💾 Using cached MySQL products');
    const filteredProducts = filterProductsWithFuzzy(mysqlCache.data, searchWords);
    const responseText = formatProductResponse(filteredProducts, searchWords);
    return responseText;
  }

  console.log('🔄 Fetching fresh products from MySQL...');
  
  try {
    // Initialize MySQL if needed
    await initMySQL();
    
    // Fetch all products from MySQL
    const allProducts = await fetchAllProductsFromMySQL();
    
    // Cache the results
    mysqlCache.data = allProducts;
    mysqlCache.timestamp = now;
    
    console.log(`📦 Cached ${allProducts.length} products from MySQL`);
    
    // Apply fuzzy filtering
    const filteredProducts = filterProductsWithFuzzy(allProducts, searchWords);
    const responseText = formatProductResponse(filteredProducts, searchWords);
    return responseText;
    
  } catch (error) {
    console.error('❌ Error fetching products from MySQL:', error);
    throw error;
  }
}

// Function to fetch all products from MySQL
async function fetchAllProductsFromMySQL() {
  try {
    const connection = await connectionPool.getConnection();
    
    try {
      // Fetch products with their variants
      const [productRows] = await connection.execute(`
        SELECT 
          p.id,
          p.title,
          p.description,
          p.tags,
          p.image_url,
          p.image_alt
        FROM products p
        ORDER BY p.title
      `);
      
      // Fetch variants for all products
      const [variantRows] = await connection.execute(`
        SELECT 
          pv.product_id,
          pv.title,
          pv.price,
          pv.inventory_quantity,
          pv.available_for_sale
        FROM product_variants pv
        ORDER BY pv.product_id, pv.title
      `);
      
      // Group variants by product
      const variantsByProduct = {};
      variantRows.forEach(variant => {
        if (!variantsByProduct[variant.product_id]) {
          variantsByProduct[variant.product_id] = [];
        }
        variantsByProduct[variant.product_id].push({
          title: variant.title,
          price: variant.price,
          inventory_quantity: variant.inventory_quantity,
          available_for_sale: variant.available_for_sale
        });
      });
      
      // Combine products with their variants
      const allProducts = productRows.map(product => ({
        id: product.id,
        title: product.title,
        description: product.description,
        tags: product.tags,
        image: product.image_url,
        imageAlt: product.image_alt,
        variants: variantsByProduct[product.id] || []
      }));
      
      console.log(`📦 Fetched ${allProducts.length} products with variants from MySQL`);
      return allProducts;
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error fetching from MySQL:', error);
    throw error;
  }
}

// Function to filter products with advanced fuzzy matching
function filterProductsWithFuzzy(products, searchWords) {
  if (!Array.isArray(products)) {
    return [];
  }

  if (!Array.isArray(searchWords) || searchWords.length === 0) {
    console.log('No search words, returning first 20 products');
    return products.slice(0, 20);
  }

  // No keyword filtering - let the fuzzy matching find relevant products
  // This allows for thousands of different gemstone names and variations

  console.log('Filtering products with advanced fuzzy matching for words:', searchWords);

  const filtered = products.filter(p => {
    const title = p.title.toLowerCase();
    const description = p.description ? p.description.toLowerCase() : '';
    const searchText = `${title} ${description}`;

    // Check if ANY of the search words match (with advanced fuzzy matching)
    const hasMatch = searchWords.some(word => {
      // Exact match first (fastest)
      if (searchText.includes(word)) {
        return true;
      }
      
      // Advanced fuzzy matching for longer words
      const wordLength = word.length;
      if (wordLength > 5) { // Increased minimum length for substring matching
        // Check if any meaningful substring of the word exists in the search text
        // Only use longer substrings to avoid false positives
        const minSubstringLength = Math.max(5, Math.floor(wordLength * 0.7)); // At least 5 chars, or 70% of word
        for (let i = 0; i <= wordLength - minSubstringLength; i++) {
          const substring = word.substring(i, i + minSubstringLength);
          if (searchText.includes(substring)) {
            // Only log meaningful matches
            if (word.length > 6) {
              console.log(`🔍 Substring match: "${word}" → "${substring}" in "${p.title}"`);
            }
            return true;
          }
        }
        
        // Check for transposed letters and character swaps
        if (wordLength > 4) {
          const searchWords = searchText.split(' ');
          for (const searchWord of searchWords) {
            if (searchWord.length > 3) {
              const similarity = calculateSimilarity(word, searchWord);
              if (similarity >= FUZZY_THRESHOLD) {
                console.log(`🔍 Fuzzy match: "${word}" ≈ "${searchWord}" (similarity: ${similarity.toFixed(2)}) in "${p.title}"`);
                logFuzzyMatch(word, searchWord, similarity, p.title);
                return true;
              }
            }
          }
        }
      }
      
      return false;
    });
    
    if (hasMatch) {
      const matchedWords = searchWords.filter(word => {
        if (searchText.includes(word)) return true;
        // Check fuzzy match
        const wordLength = word.length;
        if (wordLength > 3) {
          // Substring check
          const minSubstringLength = Math.max(3, Math.floor(wordLength * 0.6));
          for (let i = 0; i <= wordLength - Math.floor(wordLength * 0.4); i++) {
            const substring = word.substring(i, i + minSubstringLength);
            if (searchText.includes(substring)) return true;
          }
          // Similarity check
          const searchWords = searchText.split(' ');
          for (const searchWord of searchWords) {
            if (searchWord.length > 3) {
              const similarity = calculateSimilarity(word, searchWord);
              if (similarity >= FUZZY_THRESHOLD) return true;
            }
          }
        }
        return false;
      });
      
      // Reduced logging - only log first few products to reduce spam
      // Note: index is not available in this scope, so we'll log all matches for now
      console.log(`✅ Product "${p.title}" matches search word(s): ${matchedWords.join(', ')}`);
    }

    return hasMatch;
  });

  console.log(`📊 Fuzzy filtering: ${products.length} → ${filtered.length} products (reduced logging)`);
  return filtered;
}

// Function to calculate similarity between two strings (Levenshtein distance based)
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// Function to calculate Levenshtein distance
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Function to log fuzzy matches for analysis
function logFuzzyMatch(originalWord, matchedWord, similarity, productTitle) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    originalWord,
    matchedWord,
    similarity: similarity.toFixed(3),
    productTitle,
    type: 'fuzzy_match'
  };
  
  console.log('📊 FUZZY MATCH LOG:', JSON.stringify(logEntry, null, 2));
  
  // In production, you might want to send this to a logging service
  // or store it in a database for analysis
}

// Function to format product response with images
function formatProductResponse(products, searchWords) {
  if (!Array.isArray(products) || products.length === 0) {
    const searchText = Array.isArray(searchWords) ? searchWords.join(', ') : 'your search';
    return `I couldn't find any products matching "${searchText}". Please try different keywords or ask me to show you our available gemstone beads and jewelry supplies.`;
  }

  let response = `Found ${products.length} product(s) for you:\n\n`;

  products.slice(0, 20).forEach((product, index) => { // Limit display to 20
    response += `💎 ${product.title}\n`;
    
    // Add image if available
    if (product.image) {
      response += `🖼️ ${product.image}\n`;
    }

    if (product.variants && product.variants.length > 0) {
      const variants = product.variants.slice(0, 3); // Show first 3 variants
      variants.forEach(variant => {
        const price = variant.price ? `$${parseFloat(variant.price).toFixed(2)}` : 'Price on request';
        const inventory = variant.inventory_quantity > 0 ?
          `(In Stock - ${variant.inventory_quantity} left)` :
          '(Out of Stock)';
        response += `   • ${variant.title || 'Standard'}: ${price} ${inventory}\n`;
      });
    }

    response += '\n';
  });

  if (products.length > 20) {
    response += `... and ${products.length - 20} more products available!\n`;
  }

  response += "Would you like more details about any of these products, or shall I help you with something else?";

  return response;
}

// Start the server
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Reza Gem Collection Webhook running on port ${PORT}`);
  console.log(`🌐 Health check: http://0.0.0.0:${PORT}/`);
  console.log(`🔗 Webhook endpoint: http://0.0.0.0:${PORT}/webhook`);
  console.log(`📊 MySQL Host: ${MYSQL_HOST}`);
  console.log(`👤 MySQL User: ${MYSQL_USER}`);
  console.log(`🗄️ MySQL Database: ${MYSQL_DATABASE}`);
  
  // Initialize MySQL and create tables on startup
  try {
    console.log('🔧 Initializing MySQL and creating tables...');
    await initMySQL();
    console.log('✅ MySQL initialized and tables ready!');
  } catch (error) {
    console.error('❌ Failed to initialize MySQL on startup:', error.message);
  }
});

// Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error('❌ Port is already in use');
  }
});

process.on('SIGTERM', () => {
  console.log('🔄 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Export functions for testing
module.exports = {
  filterProductsWithFuzzy,
  calculateSimilarity,
  levenshteinDistance,
  formatProductResponse,
  queryMySQLProducts,
  fetchAllProductsFromMySQL,
  initMySQL
};
