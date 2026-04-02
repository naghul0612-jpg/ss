/**
 * Clothing Store (Express + MongoDB)
 * - Serves a vanilla JS frontend from /public
 * - Provides APIs for products, auth, cart, and checkout
 */

const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const DEBUG_ERRORS = NODE_ENV !== "production";
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

function clientErrorStatus(err) {
  if (!err) return 500;
  if (err.name === "CastError") return 400;
  if (err.name === "ValidationError") return 400;
  if (err.code === 11000) return 409; // Mongo duplicate key
  // Some Mongoose cast failures come with these shapes too.
  if (typeof err.message === "string" && err.message.toLowerCase().includes("cast to")) return 400;
  if (typeof err.message === "string" && err.message.toLowerCase().includes("objectid")) return 400;
  return 500;
}

function normalizeErrorMessage(err, fallback) {
  if (!err) return fallback;
  if (err.code === 11000) return "Email already registered.";
  return err.message || fallback;
}

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment.");
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment.");
  process.exit(1);
}

// -----------------------------
// Mongo Models
// -----------------------------

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

const productSchema = new Schema(
  {
    category: { type: String, required: true, enum: ["Men", "Women", "Kids"] },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const cartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true, ref: "User" },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
        quantity: { type: Number, required: true, min: 1, default: 1 }
      }
    ]
  },
  { timestamps: true }
);

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        imageUrl: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 }
      }
    ],
    subtotal: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
    shipping: {
      fullName: { type: String, default: "" },
      addressLine1: { type: String, default: "" },
      addressLine2: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
      country: { type: String, default: "" }
    }
  },
  { timestamps: false }
);

const User = mongoose.model("User", userSchema);
const Product = mongoose.model("Product", productSchema);
const Cart = mongoose.model("Cart", cartSchema);
const Order = mongoose.model("Order", orderSchema);

// -----------------------------
// Seed sample products
// -----------------------------

const UNSPLASH = {
  shirt: (sig) => `https://source.unsplash.com/featured/800x800?shirt,men&sig=${sig}`,
  jeans: (sig) => `https://source.unsplash.com/featured/800x800?jeans,denim&sig=${sig}`,
  polo: (sig) => `https://source.unsplash.com/featured/800x800?polo,shirt&sig=${sig}`,
  dress: (sig) => `https://source.unsplash.com/featured/800x800?dress,fashion&sig=${sig}`,
  jacket: (sig) => `https://source.unsplash.com/featured/800x800?denim,jacket&sig=${sig}`,
  kids: (sig) => `https://source.unsplash.com/featured/800x800?kids,clothing&sig=${sig}`,
  sneakers: (sig) => `https://source.unsplash.com/featured/800x800?sneakers,shoes&sig=${sig}`
};

const bannerUrl = `https://source.unsplash.com/featured/1800x600?fashion,shopping&sig=101`;

async function seedProductsIfEmpty() {
  const count = await Product.countDocuments();
  if (count > 0) return;

  const sample = [
    { category: "Men", name: "Slim Fit Denim Jeans", price: 799, imageUrl: UNSPLASH.jeans(1) },
    { category: "Men", name: "Cotton Oxford Shirt", price: 599, imageUrl: UNSPLASH.shirt(2) },
    { category: "Men", name: "Classic Polo Tee", price: 499, imageUrl: UNSPLASH.polo(3) },
    { category: "Men", name: "Blue Denim Jacket", price: 1299, imageUrl: UNSPLASH.jacket(4) },
    { category: "Women", name: "Floral Summer Dress", price: 999, imageUrl: UNSPLASH.dress(5) },
    { category: "Women", name: "Elegant Midi Dress", price: 1199, imageUrl: UNSPLASH.dress(6) },
    { category: "Women", name: "Denim Jacket (Women)", price: 1399, imageUrl: UNSPLASH.jacket(7) },
    { category: "Women", name: "Soft Jersey T-Shirt Dress", price: 849, imageUrl: UNSPLASH.dress(8) },
    { category: "Kids", name: "Kids T-Shirt Pack", price: 399, imageUrl: UNSPLASH.kids(9) },
    { category: "Kids", name: "Boys Joggers (Comfort Fit)", price: 549, imageUrl: UNSPLASH.kids(10) },
    { category: "Kids", name: "Girls Party Dress", price: 699, imageUrl: UNSPLASH.dress(11) },
    { category: "Kids", name: "Kids Sneakers (Everyday)", price: 899, imageUrl: UNSPLASH.sneakers(12) }
  ].map((p) => ({
    ...p,
    // Keep the seed deterministic: set isActive default is fine
    imageUrl: p.imageUrl
  }));

  await Product.insertMany(sample);

  // Store banner in a lightweight way by creating a special product doc is overkill.
  // Frontend uses its own banner image URL fallback.
  console.log(`Seeded ${sample.length} products. Banner: ${bannerUrl}`);
}

// -----------------------------
// Auth
// -----------------------------

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return res.status(401).json({ message: "Missing token." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Validate ObjectId early to avoid Mongoose CastError -> 500
    if (!mongoose.Types.ObjectId.isValid(payload.sub)) {
      return res.status(401).json({ message: "Invalid token subject." });
    }
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid/expired token." });
  }
}

// -----------------------------
// API Routes
// -----------------------------

const api = express.Router();

// Auth: register
api.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: "name, email, password required." });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: "Email already registered." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: String(name).trim(), email: String(email).toLowerCase().trim(), passwordHash });
    return res.status(201).json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    const status = clientErrorStatus(err);
    const message = status === 409 ? normalizeErrorMessage(err, "Email already registered.") : "Register failed.";
    return res.status(status).json({
      message,
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

// Auth: login
api.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "email, password required." });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials." });

    return res.json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    const status = clientErrorStatus(err);
    return res.status(status).json({
      message: status === 400 ? "Invalid credentials." : "Login failed.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

// Products
api.get("/products", async (req, res) => {
  try {
    const category = req.query.category;
    const q = { isActive: true };
    if (category && ["Men", "Women", "Kids"].includes(String(category))) {
      q.category = category;
    }
    const products = await Product.find(q).sort({ createdAt: -1 }).limit(48);
    return res.json({
      products: products.map((p) => ({
        id: p._id,
        category: p.category,
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl
      }))
    });
  } catch (err) {
    console.error(err);
    const status = clientErrorStatus(err);
    return res.status(status).json({
      message: status === 400 ? "Invalid request." : "Failed to fetch products.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

api.get("/products/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Product not found." });
    const p = await Product.findById(req.params.id);
    if (!p || !p.isActive) return res.status(404).json({ message: "Product not found." });
    return res.json({
      product: {
        id: p._id,
        category: p.category,
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl
      }
    });
  } catch {
    return res.status(404).json({ message: "Product not found." });
  }
});

// Cart
api.get("/cart", authMiddleware, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.userId }).lean();
    if (!cart) return res.json({ items: [], subtotal: 0 });

    const ids = cart.items
      .map((it) => it.productId)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const products = await Product.find({ _id: { $in: ids } }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items = cart.items
      .map((it) => {
        const p = byId.get(String(it.productId));
        if (!p) return null;
        return {
          productId: it.productId,
          quantity: it.quantity,
          product: {
            id: p._id,
            name: p.name,
            price: p.price,
            imageUrl: p.imageUrl,
            category: p.category
          }
        };
      })
      .filter(Boolean);

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.product.price, 0);
    return res.json({ items, subtotal });
  } catch (err) {
    console.error(err);
    return res.status(clientErrorStatus(err)).json({
      message: "Failed to load cart.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

api.post("/cart/add", authMiddleware, async (req, res) => {
  try {
    const { productId, quantity } = req.body || {};
    if (!productId) return res.status(400).json({ message: "productId required." });
    if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ message: "Invalid productId." });
    const qty = quantity ? Number(quantity) : 1;
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ message: "quantity must be >= 1." });

    const product = await Product.findById(productId);
    if (!product || !product.isActive) return res.status(404).json({ message: "Product not found." });

    // MongoDB-version-safe flow: read -> mutate -> save
    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) {
      try {
        cart = await Cart.create({ userId: req.userId, items: [{ productId, quantity: qty }] });
      } catch (err) {
        // In case another request created the cart first
        if (err && err.code === 11000) {
          cart = await Cart.findOne({ userId: req.userId });
        } else {
          throw err;
        }
      }
    } else {
      const found = cart.items.find((x) => String(x.productId) === String(productId));
      if (found) found.quantity += qty;
      else cart.items.push({ productId, quantity: qty });
      await cart.save();
    }

    return res.status(201).json({ message: "Added to cart." });
  } catch (err) {
    console.error(err);
    return res.status(clientErrorStatus(err)).json({
      message: "Failed to add to cart.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

api.patch("/cart/update", authMiddleware, async (req, res) => {
  try {
    const { productId, quantity } = req.body || {};
    if (!productId) return res.status(400).json({ message: "productId required." });
    if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ message: "Invalid productId." });
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ message: "quantity must be >= 1." });

    const cart = await Cart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ message: "Cart not found." });

    const item = cart.items.find((it) => String(it.productId) === String(productId));
    if (!item) return res.status(404).json({ message: "Item not found in cart." });

    item.quantity = qty;
    await cart.save();
    return res.json({ message: "Cart updated." });
  } catch (err) {
    console.error(err);
    return res.status(clientErrorStatus(err)).json({
      message: "Failed to update cart.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

api.delete("/cart/remove", authMiddleware, async (req, res) => {
  try {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ message: "productId required." });
    if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ message: "Invalid productId." });

    const cart = await Cart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ message: "Cart not found." });

    cart.items = cart.items.filter((it) => String(it.productId) !== String(productId));
    await cart.save();
    return res.json({ message: "Removed from cart." });
  } catch (err) {
    console.error(err);
    return res.status(clientErrorStatus(err)).json({
      message: "Failed to remove item.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

// Checkout
api.post("/checkout", authMiddleware, async (req, res) => {
  try {
    const { shipping } = req.body || {};

    const cart = await Cart.findOne({ userId: req.userId });
    if (!cart || cart.items.length === 0) return res.status(400).json({ message: "Cart is empty." });

    const ids = cart.items
      .map((it) => it.productId)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const products = await Product.find({ _id: { $in: ids } }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items = [];
    for (const it of cart.items) {
      const p = byId.get(String(it.productId));
      if (!p) continue;
      items.push({
        productId: p._id,
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl,
        quantity: it.quantity
      });
    }

    if (items.length === 0) return res.status(400).json({ message: "No valid items in cart." });
    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.price, 0);

    const order = await Order.create({
      userId: req.userId,
      items,
      subtotal,
      shipping: shipping || {}
    });

    // Clear cart
    cart.items = [];
    await cart.save();

    return res.status(201).json({
      message: "Checkout successful.",
      order: {
        id: order._id,
        subtotal: order.subtotal,
        createdAt: order.createdAt
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(clientErrorStatus(err)).json({
      message: "Checkout failed.",
      ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
    });
  }
});

app.use("/api", api);

// Catch any unexpected errors that aren't already handled in route try/catch.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  const status = clientErrorStatus(err);
  res.status(status).json({
    message: status === 400 ? "Invalid request." : "Internal server error",
    ...(DEBUG_ERRORS ? { error: err.message, stack: err.stack } : {})
  });
});

// -----------------------------
// Frontend static
// -----------------------------

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/checkout", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "checkout.html"));
});

// -----------------------------
// Start
// -----------------------------

async function start() {
  await mongoose.connect(MONGODB_URI);
  await seedProductsIfEmpty();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

