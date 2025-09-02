const mysql = require('mysql2/promise');
const https = require('https');
require('dotenv').config();

// Configuration
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
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
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000
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

// Fetch all products from Shopify using GraphQL
async function fetchAllProductsFromShopify() {
  console.log('🔄 Fetching products from Shopify...');
  
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  let pageCount = 0;
  
  while (hasNextPage) {
    const { products, nextCursor, hasMore } = await fetchProductsPage(cursor);
    allProducts = allProducts.concat(products);
    pageCount++;
    
    console.log(`📄 Fetched page ${pageCount}: ${products.length} products, total: ${allProducts.length}`);
    
    if (hasMore) {
      cursor = nextCursor;
    } else {
      hasNextPage = false;
    }
  }
  
  console.log(`✅ Total products fetched: ${allProducts.length}`);
  return allProducts;
}

// Fetch a single page of products
async function fetchProductsPage(cursor = null) {
  return new Promise((resolve, reject) => {
    const graphqlQuery = {
      query: `
        query getProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              node {
                id
                title
                descriptionHtml
                tags
                images(first: 1) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      title
                      price
                      inventoryQuantity
                      availableForSale
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      variables: {
        first: 250,
        after: cursor
      }
    };

    const postData = JSON.stringify(graphqlQuery);

    const options = {
      hostname: SHOPIFY_SHOP,
      port: 443,
      path: '/admin/api/2023-10/graphql.json',
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.errors) {
            console.error('GraphQL errors:', response.errors);
            reject(new Error('GraphQL query failed: ' + JSON.stringify(response.errors)));
            return;
          }

          const products = response.data.products.edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.title,
            description: edge.node.descriptionHtml,
            tags: edge.node.tags,
            image: edge.node.images.edges.length > 0 ? edge.node.images.edges[0].node.url : null,
            imageAlt: edge.node.images.edges.length > 0 ? edge.node.images.edges[0].node.altText : null,
            variants: edge.node.variants.edges.map(variantEdge => ({
              title: variantEdge.node.title,
              price: variantEdge.node.price,
              inventory_quantity: variantEdge.node.inventoryQuantity,
              available_for_sale: variantEdge.node.availableForSale
            }))
          }));

          const pageInfo = response.data.products.pageInfo;
          
          resolve({
            products,
            nextCursor: pageInfo.endCursor,
            hasMore: pageInfo.hasNextPage
          });

        } catch (error) {
          console.error('Error parsing GraphQL response:', error);
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Save products to MySQL
async function saveProductsToMySQL(products) {
  console.log('💾 Saving products to MySQL...');
  
  const connection = await connectionPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let productsUpdated = 0;
    let variantsUpdated = 0;
    
    for (const product of products) {
      // Insert or update product
      const productQuery = `
        INSERT INTO products (id, title, description, tags, image_url, image_alt) 
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          title = VALUES(title),
          description = VALUES(description),
          tags = VALUES(tags),
          image_url = VALUES(image_url),
          image_alt = VALUES(image_alt),
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await connection.execute(productQuery, [
        product.id,
        product.title,
        product.description,
        product.tags ? product.tags.join(', ') : null,
        product.image,
        product.imageAlt
      ]);
      
      productsUpdated++;
      
      // Delete existing variants for this product
      await connection.execute('DELETE FROM product_variants WHERE product_id = ?', [product.id]);
      
      // Insert new variants
      for (const variant of product.variants) {
        const variantQuery = `
          INSERT INTO product_variants (product_id, title, price, inventory_quantity, available_for_sale)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        await connection.execute(variantQuery, [
          product.id,
          variant.title,
          variant.price,
          variant.inventory_quantity,
          variant.available_for_sale
        ]);
        
        variantsUpdated++;
      }
    }
    
    await connection.commit();
    console.log(`✅ Saved ${productsUpdated} products and ${variantsUpdated} variants to MySQL`);
    
    return { productsUpdated, variantsUpdated };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Log sync operation
async function logSyncOperation(productsFetched, productsUpdated, variantsFetched, variantsUpdated, status, errorMessage, durationSeconds) {
  const connection = await connectionPool.getConnection();
  
  try {
    const query = `
      INSERT INTO sync_log (products_fetched, products_updated, variants_fetched, variants_updated, status, error_message, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await connection.execute(query, [
      productsFetched,
      productsUpdated,
      variantsFetched,
      variantsUpdated,
      status,
      errorMessage,
      durationSeconds
    ]);
    
    console.log('📊 Sync operation logged to database');
    
  } catch (error) {
    console.error('❌ Failed to log sync operation:', error.message);
  } finally {
    connection.release();
  }
}

// Main sync function
async function syncShopifyToMySQL() {
  const startTime = Date.now();
  console.log('🚀 Starting Shopify to MySQL sync...');
  
  try {
    // Check configuration
    if (!SHOPIFY_SHOP || !SHOPIFY_TOKEN) {
      throw new Error('Missing Shopify configuration. Check your .env file.');
    }
    
    // Initialize MySQL
    const mysqlReady = await initMySQL();
    if (!mysqlReady) {
      throw new Error('MySQL connection failed');
    }
    
    // Fetch products from Shopify
    const products = await fetchAllProductsFromShopify();
    const variantsCount = products.reduce((total, p) => total + p.variants.length, 0);
    
    // Save to MySQL
    const { productsUpdated, variantsUpdated } = await saveProductsToMySQL(products);
    
    // Calculate duration
    const durationSeconds = (Date.now() - startTime) / 1000;
    
    // Log success
    await logSyncOperation(
      products.length,
      productsUpdated,
      variantsCount,
      variantsUpdated,
      'success',
      null,
      durationSeconds
    );
    
    console.log(`🎉 Sync completed successfully in ${durationSeconds.toFixed(2)} seconds`);
    console.log(`📊 Products: ${productsUpdated}/${products.length}, Variants: ${variantsUpdated}/${variantsCount}`);
    
    return {
      success: true,
      productsFetched: products.length,
      productsUpdated,
      variantsFetched: variantsCount,
      variantsUpdated,
      durationSeconds
    };
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    
    const durationSeconds = (Date.now() - startTime) / 1000;
    
    // Log error
    await logSyncOperation(
      0, 0, 0, 0,
      'error',
      error.message,
      durationSeconds
    );
    
    return {
      success: false,
      error: error.message,
      durationSeconds
    };
  } finally {
    if (connectionPool) {
      await connectionPool.end();
    }
  }
}

// Export for use in other files
module.exports = { syncShopifyToMySQL };

// Run directly if called from command line
if (require.main === module) {
  syncShopifyToMySQL()
    .then(result => {
      if (result.success) {
        console.log('✅ Sync completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Sync failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}
