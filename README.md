# Reza Gem Collection - Dialogflow CX Agent with Shopify Integration

## Project Overview

This project creates a sophisticated Dialogflow CX agent for Reza Gem Collection that can:

- **Dynamically answer user queries** about gemstone bead products in the Shopify store
- **Handle products with multiple word orders** in their titles (e.g., "amethyst round beads" vs "round amethyst beads")
- **Handle variants (sizes) correctly** for different bead sizes and qualities
- **Answer general questions** using AI for jewelry making advice, care instructions, and educational content
- **Provide professional customer service** with brand-specific responses

## Business Context

**Reza Gem Collection** specializes in:
- Natural gemstone beads sold by the strand
- Various shapes: round, oval, chip, faceted, smooth
- Multiple sizes: 2mm to 20mm depending on stone type
- Quality grades: A, AA, AAA for premium stones
- Wholesale and retail sales
- Custom jewelry making services
- Jewelry repair services

## 1️⃣ Shopify Store Requirements

### Product Structure
Products must have:
- **Title**: e.g., "Natural Amethyst Round Beads - 8mm A Grade"
- **Description**: Detailed product information including metaphysical properties
- **Variants**: Different sizes and qualities (2mm, 4mm, 6mm, 8mm, etc.)
- **Variant options**: Size stored in Shopify `option1` or `Size` field
- **Collections**: Organized by stone type, shape, or size
- **Inventory tracking**: Real-time availability

### Required Shopify Setup
- **Private App** or **OAuth credentials** for API access
- **Product catalog** with consistent naming conventions
- **Variant management** for sizes and qualities
- **Inventory sync** for real-time stock levels

## 2️⃣ Dialogflow CX Agent Architecture

### 2.1 Core Intent: AskProduct

**Name**: `AskProduct`
**Purpose**: Capture all product-related queries and extract relevant parameters

**Training Phrases Examples**:
```
I want {product} beads
Show me {product}
Do you have {product} in {size}?
Looking for {size} {product}
Need {product} beads for jewelry making
What {product} do you have?
Show me {product} in {quality} grade
I'm looking for {shape} {product} beads
```

**Parameters**:
- **product** (required): `@sys.any` - Stone name or product type
- **size** (optional): `@sys.any` - Bead size (2mm, 4mm, etc.)
- **shape** (optional): `@sys.any` - Bead shape (round, oval, chip)
- **quality** (optional): `@sys.any` - Quality grade (A, AA, AAA)

### 2.2 Page: ProductPage

**Name**: `ProductPage`
**Purpose**: Handles conversation flow after product intent is triggered
**Entry Fulfillment**: Calls Shopify webhook to query products dynamically
**Response Strategy**: 
- Show matching products with available variants
- Display pricing and availability
- Offer alternatives if exact match not found

### 2.3 Route Configuration

**Connection**: `AskProduct` intent → `ProductPage`
**Transition**: Immediate webhook call to Shopify API
**Fallback**: If no products found, offer alternatives or general help

### 2.4 Welcome Intent Enhancement

**Name**: `Enhanced Welcome Intent`
**Purpose**: Professional greeting with service overview
**Response**: 
```
Welcome to Reza Gem Collection! I'm your AI assistant, here to help you with all things gemstones and jewelry.

I can help you with:
• Gemstone bead inquiries and purchases
• Jewelry making advice and guidance
• Jewelry repair services
• Product recommendations and education
• Store information and appointments
• Wholesale inquiries and bulk orders

What would you like to know about today?
```

### 2.5 Fallback Intent for General Questions

**Name**: `Enhanced Fallback Intent`
**Purpose**: Handle jewelry-related questions not about specific products
**Categories**:
- Jewelry making techniques
- Stone care and cleaning
- Metaphysical properties
- Birthstone information
- Wholesale inquiries
- Repair services

## 3️⃣ Webhook Logic for Product Queries

### Core Process Flow:
1. **Receive Parameters**: Extract product, size, shape, quality from CX
2. **Keyword Processing**: Convert user input to searchable keywords
3. **Shopify Query**: Search products using title and description
4. **Smart Matching**: Match keywords regardless of word order
5. **Variant Filtering**: Filter by size, quality, or shape if specified
6. **Response Building**: Format professional product response
7. **Inventory Check**: Show real-time availability

### Matching Strategy:
- **Flexible keyword matching**: "amethyst round" matches "Round Amethyst Beads"
- **Synonym handling**: "purple" matches "amethyst", "blue" matches "lapis"
- **Size normalization**: "8mm" matches "8 mm" or "8MM"
- **Quality matching**: "high quality" matches "AA" or "AAA" grade

### Response Format:
```
Found these Amethyst products for you:

🔮 Natural Amethyst Round Beads - A Grade
   • 6mm: $24.99 per strand (In Stock)
   • 8mm: $28.99 per strand (In Stock)
   • 10mm: $32.99 per strand (Low Stock - 3 left)

🔮 Premium Amethyst Round Beads - AA Grade
   • 8mm: $38.99 per strand (In Stock)
   • 10mm: $42.99 per strand (In Stock)

Would you like more details about any of these, or shall I help you with something else?
```

## 4️⃣ Conversation Flow Examples

### Product Query Flow:
```
User: "Do you have rose quartz beads in 8mm?"
↓ Intent: AskProduct (product=rose quartz, size=8mm)
↓ Route → ProductPage
↓ Webhook queries Shopify for rose quartz + 8mm variants
↓ Response: Shows matching products with pricing and availability
```

### General Question Flow:
```
User: "How do I clean my gemstone jewelry?"
↓ No product intent match → Enhanced Fallback
↓ AI webhook provides care instructions
↓ Response: Professional jewelry care advice
```

### Complex Query Flow:
```
User: "I need high quality round amethyst for a bracelet project"
↓ Intent: AskProduct (product=amethyst, shape=round, quality=high)
↓ Webhook matches AA/AAA grade round amethyst beads
↓ Response: Premium options with jewelry making suggestions
```

## 5️⃣ Advanced Features

### Business Intelligence:
- **Popular product tracking**: Monitor most requested items
- **Inventory alerts**: Notify when stock is low
- **Customer preferences**: Remember frequent buyers
- **Seasonal recommendations**: Suggest trending stones

### Customer Service:
- **Wholesale pricing**: Detect bulk inquiries and offer wholesale rates
- **Appointment booking**: Schedule jewelry repair or consultation
- **Order tracking**: Check status of existing orders
- **Return policy**: Handle return and exchange inquiries

### Educational Content:
- **Stone properties**: Metaphysical and healing properties
- **Jewelry making tips**: Techniques and best practices
- **Birthstone guide**: Monthly birthstone recommendations
- **Care instructions**: Proper cleaning and storage

## 6️⃣ Implementation Strategy

### Phase 1: Core Product Search
- Set up basic product intent and Shopify integration
- Implement flexible keyword matching
- Create professional response templates

### Phase 2: Enhanced Features
- Add size, shape, and quality parameter handling
- Implement inventory checking and low stock alerts
- Create educational content responses

### Phase 3: Business Optimization
- Add wholesale inquiry detection
- Implement appointment booking
- Create customer preference tracking

### Phase 4: Advanced AI
- Add personalized recommendations
- Implement seasonal product suggestions
- Create advanced jewelry making advisor

## 7️⃣ Key Success Factors

### Technical Excellence:
- **No separate intent per product** — dynamic webhook handles all products
- **Word order independence** — flexible keyword matching
- **Real-time inventory** — accurate stock information
- **Professional responses** — brand-consistent communication

### Business Value:
- **Increased sales** — easier product discovery
- **Better customer experience** — instant, accurate responses
- **Reduced support load** — automated common inquiries
- **Brand enhancement** — professional, knowledgeable assistant

### Scalability:
- **Easy product additions** — no intent updates needed
- **Flexible categorization** — handles new product types
- **Multi-language ready** — expandable for international customers
- **Integration ready** — connects with existing business systems

---

**Next Steps**: Ready to implement this comprehensive Dialogflow CX agent for Reza Gem Collection with full Shopify integration and professional customer service capabilities.
