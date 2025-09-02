-- MySQL Database Setup for Reza Gem Collection Products
-- Run this script to create the necessary tables

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS rezagemcollection;
USE rezagemcollection;

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  tags TEXT,
  image_url VARCHAR(500),
  image_alt VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for fast searching
  INDEX idx_title (title(100)),
  INDEX idx_tags (tags(100)),
  FULLTEXT INDEX idx_search (title, description, tags)
);

-- Product variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  price DECIMAL(10,2),
  inventory_quantity INT DEFAULT 0,
  available_for_sale BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product_id (product_id),
  INDEX idx_price (price),
  INDEX idx_available (available_for_sale)
);

-- Sync log table to track updates
CREATE TABLE IF NOT EXISTS sync_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  products_fetched INT DEFAULT 0,
  products_updated INT DEFAULT 0,
  variants_fetched INT DEFAULT 0,
  variants_updated INT DEFAULT 0,
  status ENUM('success', 'error', 'partial') DEFAULT 'success',
  error_message TEXT,
  duration_seconds DECIMAL(10,2)
);

-- Insert sample data for testing
INSERT INTO sync_log (products_fetched, products_updated, variants_fetched, variants_updated, status) 
VALUES (0, 0, 0, 0, 'success');

-- Show tables
SHOW TABLES;
DESCRIBE products;
DESCRIBE product_variants;
DESCRIBE sync_log;
