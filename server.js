require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = 3000;

/* =========================
   EJS
========================= */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


/* =========================
   MYSQL CONNECTION
========================= */

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "shopnest"
});
db.connect((err) => {

    if (err) {
        console.error("Database connection failed:", err.message);
        return;
    }

    console.log("MySQL database connected successfully!");

});


/* =========================
   MIDDLEWARE
========================= */

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: "shopnest-secret-key",
    resave: false,
    saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, "public")));


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

    res.send(`
        <h1>ShopNest E-Commerce Server is Running!</h1>
        <p><a href="/login">Go to Login</a></p>
    `);

});


/* =========================
   REGISTER PAGE
========================= */

app.get("/register", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "user", "register.html")
    );

});


/* =========================
   REGISTER
========================= */

app.post("/register", async (req, res) => {

    const {
        name,
        email,
        phone,
        password
    } = req.body;

    if (!name || !email || !phone || !password) {

        return res.send(`
            <h2>All fields are required.</h2>
            <a href="/register">Go Back</a>
        `);

    }

    try {

        const [existingUser] =
            await db.promise().query(
                "SELECT id FROM users WHERE email = ?",
                [email]
            );

        if (existingUser.length > 0) {

            return res.send(`
                <h2>Email already registered.</h2>
                <p>Please use another email.</p>
                <a href="/register">Go Back</a>
            `);

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        await db.promise().query(
            `INSERT INTO users
            (name, email, password, phone, role)
            VALUES (?, ?, ?, ?, 'user')`,
            [
                name,
                email,
                hashedPassword,
                phone
            ]
        );

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Registration Successful</title>
                <style>
                    body {
                        font-family: Arial;
                        background: #f5f6fa;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                    }

                    .box {
                        background: white;
                        padding: 40px;
                        border-radius: 15px;
                        text-align: center;
                        box-shadow: 0 5px 20px rgba(0,0,0,.15);
                    }

                    h2 {
                        color: #28a745;
                    }

                    a {
                        display: inline-block;
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: #5b4bc4;
                        color: white;
                        text-decoration: none;
                        border-radius: 8px;
                    }
                </style>
            </head>

            <body>

                <div class="box">

                    <h2>Registration Successful!</h2>

                    <p>
                        Welcome to ShopNest, ${name}.
                    </p>

                    <a href="/login">
                        Go to Login
                    </a>

                </div>

            </body>
            </html>
        `);

    } catch (error) {

        console.error("Registration error:", error);

        res.status(500).send(
            "Registration failed."
        );

    }

});


/* =========================
   LOGIN PAGE
========================= */

app.get("/login", (req, res) => {

    res.sendFile(
        path.join(__dirname, "views", "user", "login.html")
    );

});


/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {

    const {
        email,
        password
    } = req.body;

    if (!email || !password) {

        return res.send(`
            <h2>Email and password are required.</h2>
            <a href="/login">Try Again</a>
        `);

    }

    try {

        const [users] =
            await db.promise().query(
                "SELECT * FROM users WHERE email = ?",
                [email]
            );

        if (users.length === 0) {

            return res.send(`
                <h2>Invalid email or password.</h2>
                <a href="/login">Try Again</a>
            `);

        }

        const user = users[0];

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatch) {

            return res.send(`
                <h2>Invalid email or password.</h2>
                <a href="/login">Try Again</a>
            `);

        }

        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.role = user.role;

        if (user.role === "admin") {

            return res.redirect("/admin");

        }

        res.redirect("/dashboard");

    } catch (error) {

        console.error("Login error:", error);

        res.status(500).send(
            "Login failed."
        );

    }

});


/* =========================
   USER DASHBOARD
========================= */

app.get("/dashboard", async (req, res) => {

    if (!req.session.userId) {

        return res.redirect("/login");

    }

    try {

        const [products] =
            await db.promise().query(
                "SELECT * FROM products ORDER BY id DESC"
            );

        res.render("user/dashboard", {
            products: products
        });

    } catch (error) {

        console.error("Dashboard error:", error);

        res.status(500).send(
            "Unable to load dashboard."
        );

    }

});


/* =========================
   ADD TO CART
========================= */

app.post("/add-to-cart", async (req, res) => {

    if (!req.session.userId) {

        return res.status(401).send(
            "Please login first."
        );

    }

    const productId = req.body.productId;

    if (!productId) {

        return res.status(400).send(
            "Product ID is required."
        );

    }

    try {

        const [product] =
            await db.promise().query(
                "SELECT id FROM products WHERE id = ?",
                [productId]
            );

        if (product.length === 0) {

            return res.status(404).send(
                "Product not found."
            );

        }

        const [existing] =
            await db.promise().query(
                `SELECT * FROM cart
                 WHERE user_id = ?
                 AND product_id = ?`,
                [
                    req.session.userId,
                    productId
                ]
            );

        if (existing.length > 0) {

            await db.promise().query(
                `UPDATE cart
                 SET quantity = quantity + 1
                 WHERE user_id = ?
                 AND product_id = ?`,
                [
                    req.session.userId,
                    productId
                ]
            );

        } else {

            await db.promise().query(
                `INSERT INTO cart
                (user_id, product_id, quantity)
                VALUES (?, ?, 1)`,
                [
                    req.session.userId,
                    productId
                ]
            );

        }

        res.send("Product added to cart!");

    } catch (error) {

        console.error("Add cart error:", error);

        res.status(500).send(
            "Unable to add product."
        );

    }

});


/* =========================
   CART PAGE
========================= */

app.get("/cart", async (req, res) => {

    if (!req.session.userId) {

        return res.redirect("/login");

    }

    try {

        const [cart] =
            await db.promise().query(
                `SELECT
                    cart.product_id,
                    cart.quantity,
                    products.name,
                    products.price,
                    products.image
                 FROM cart
                 JOIN products
                 ON cart.product_id = products.id
                 WHERE cart.user_id = ?`,
                [req.session.userId]
            );

        let total = 0;

        cart.forEach((item) => {

            total +=
                Number(item.price) *
                Number(item.quantity);

        });

        res.render("user/cart", {
            cart: cart,
            total: total
        });

    } catch (error) {

        console.error("Cart error:", error);

        res.status(500).send(
            "Unable to load cart."
        );

    }

});


/* =========================
   UPDATE CART
========================= */

app.post("/update-cart", async (req, res) => {

    if (!req.session.userId) {

        return res.status(401).send(
            "Please login first."
        );

    }

    const productId = req.body.productId;
    const change = Number(req.body.change);

    if (!productId || ![-1, 1].includes(change)) {

        return res.status(400).send(
            "Invalid cart request."
        );

    }

    try {

        await db.promise().query(
            `UPDATE cart
             SET quantity = quantity + ?
             WHERE user_id = ?
             AND product_id = ?`,
            [
                change,
                req.session.userId,
                productId
            ]
        );

        await db.promise().query(
            `DELETE FROM cart
             WHERE user_id = ?
             AND product_id = ?
             AND quantity <= 0`,
            [
                req.session.userId,
                productId
            ]
        );

        res.send("Cart updated.");

    } catch (error) {

        console.error(
            "Update cart error:",
            error
        );

        res.status(500).send(
            "Unable to update cart."
        );

    }

});


/* =========================
   LOGOUT
========================= */

app.get("/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {

            console.error(
                "Logout error:",
                error
            );

            return res.status(500).send(
                "Unable to logout."
            );

        }

        res.redirect("/login");

    });

});



app.get("/product/:id", async (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    try {

        const [products] = await db.promise().query(
            "SELECT * FROM products WHERE id = ?",
            [req.params.id]
        );

        if (products.length === 0) {
            return res.status(404).send("Product not found.");
        }

        res.render("user/product", {
            product: products[0]
        });

    } catch (error) {

        console.error("Product error:", error);
        res.status(500).send("Unable to load product.");

    }

});

/* =========================
   ORDER DETAILS
========================= */

app.get("/order", async (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    try {

        const [users] = await db.promise().query(
            "SELECT name, phone FROM users WHERE id = ?",
            [req.session.userId]
        );

        if (users.length === 0) {
            return res.redirect("/logout");
        }

        const [cart] = await db.promise().query(
            `SELECT cart.quantity, products.price
             FROM cart
             JOIN products
             ON cart.product_id = products.id
             WHERE cart.user_id = ?`,
            [req.session.userId]
        );

        if (cart.length === 0) {
            return res.send(`
                <h2>Your cart is empty.</h2>
                <a href="/dashboard">Go Shopping</a>
            `);
        }

        res.render("user/order", {
            user: users[0]
        });

    } catch (error) {

        console.error("Order page error:", error);
        res.status(500).send("Unable to load order page.");

    }

});


/* =========================
   PAYMENT PAGE
========================= */

app.post("/payment", async (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    req.session.orderDetails = {
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
        city: req.body.city,
        pincode: req.body.pincode
    };

    try {

        const [cart] = await db.promise().query(
            `SELECT cart.quantity, products.price, products.name
             FROM cart
             JOIN products
             ON cart.product_id = products.id
             WHERE cart.user_id = ?`,
            [req.session.userId]
        );

        let total = 0;

        cart.forEach(item => {
            total += Number(item.price) * Number(item.quantity);
        });

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>ShopNest - Payment</title>
                <style>
                    body {
                        font-family: Arial;
                        background: #f5f6fa;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }

                    .box {
                        background: white;
                        padding: 40px;
                        width: 500px;
                        border-radius: 15px;
                        box-shadow: 0 5px 20px rgba(0,0,0,.1);
                    }

                    h1 {
                        color: #5b4bc4;
                    }

                    .payment {
                        border: 2px solid #5b4bc4;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }

                    button {
                        width: 100%;
                        padding: 14px;
                        border: 0;
                        border-radius: 8px;
                        background: #5b4bc4;
                        color: white;
                        font-size: 16px;
                        cursor: pointer;
                    }
                </style>
            </head>

            <body>

                <div class="box">

                    <h1>Payment</h1>

                    <div class="payment">
                        <h3>Cash on Delivery</h3>
                        <p>Pay when your order is delivered.</p>
                    </div>

                    <h2>Total Amount: ₹${total.toFixed(2)}</h2>

                    <form action="/place-order" method="POST">
                        <button type="submit">
                            Place Order
                        </button>
                    </form>

                </div>

            </body>
            </html>
        `);

    } catch (error) {

        console.error("Payment error:", error);
        res.status(500).send("Unable to load payment page.");

    }

});


/* =========================
   PLACE ORDER
========================= */

app.post("/place-order", async (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const details = req.session.orderDetails;

    if (!details) {
        return res.redirect("/order");
    }

    try {

        const [cart] = await db.promise().query(
            `SELECT cart.product_id,
                    cart.quantity,
                    products.price
             FROM cart
             JOIN products
             ON cart.product_id = products.id
             WHERE cart.user_id = ?`,
            [req.session.userId]
        );

        if (cart.length === 0) {
            return res.redirect("/dashboard");
        }

        let total = 0;

        cart.forEach(item => {
            total += Number(item.price) * Number(item.quantity);
        });

        const [orderResult] = await db.promise().query(
            `INSERT INTO orders
            (user_id, total_amount, name, phone, address, city, pincode,
             payment_method, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Cash on Delivery', 'Placed')`,
            [
                req.session.userId,
                total,
                details.name,
                details.phone,
                details.address,
                details.city,
                details.pincode
            ]
        );

        const orderId = orderResult.insertId;

        for (const item of cart) {

            await db.promise().query(
                `INSERT INTO order_items
                (order_id, product_id, quantity, price)
                VALUES (?, ?, ?, ?)`,
                [
                    orderId,
                    item.product_id,
                    item.quantity,
                    item.price
                ]
            );

        }

        await db.promise().query(
            "DELETE FROM cart WHERE user_id = ?",
            [req.session.userId]
        );

        delete req.session.orderDetails;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Order Placed</title>
                <style>
                    body {
                        font-family: Arial;
                        background: #f5f6fa;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }

                    .box {
                        background: white;
                        padding: 45px;
                        text-align: center;
                        border-radius: 18px;
                        box-shadow: 0 5px 20px rgba(0,0,0,.12);
                    }

                    h1 {
                        color: #28a745;
                    }

                    .order {
                        margin: 20px 0;
                        font-size: 18px;
                    }

                    a {
                        display: inline-block;
                        padding: 12px 25px;
                        background: #5b4bc4;
                        color: white;
                        text-decoration: none;
                        border-radius: 8px;
                        margin: 5px;
                    }
                </style>
            </head>

            <body>

                <div class="box">

                    <h1>✓ Order Placed Successfully!</h1>

                    <div class="order">
                        <p>Thank you for shopping with ShopNest.</p>
                        <p><b>Order ID:</b> #${orderId}</p>
                        <p><b>Payment:</b> Cash on Delivery</p>
                        <p><b>Status:</b> Placed</p>
                    </div>

                    <a href="/orders">View My Orders</a>
                    <a href="/dashboard">Continue Shopping</a>

                </div>

            </body>
            </html>
        `);

    } catch (error) {

        console.error("Place order error:", error);
        res.status(500).send("Unable to place order.");

    }

});
/* =========================
   MY ORDERS
========================= */

app.get("/orders", async (req, res) => {

    if (!req.session.userId) {
        return res.redirect("/login");
    }

    try {

        const [orders] = await db.promise().query(
            `SELECT *
             FROM orders
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [req.session.userId]
        );

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>My Orders - ShopNest</title>
                <style>
                    body {
                        font-family: Arial;
                        background: #f5f6fa;
                        margin: 0;
                    }

                    header {
                        background: linear-gradient(135deg,#5b4bc4,#7b61ff);
                        color: white;
                        padding: 20px 40px;
                        display: flex;
                        justify-content: space-between;
                    }

                    header a {
                        color: white;
                        text-decoration: none;
                        margin-left: 20px;
                    }

                    .container {
                        max-width: 900px;
                        margin: 40px auto;
                    }

                    .order {
                        background: white;
                        padding: 25px;
                        margin-bottom: 20px;
                        border-radius: 12px;
                        box-shadow: 0 4px 15px rgba(0,0,0,.08);
                    }

                    .status {
                        color: #5b4bc4;
                        font-weight: bold;
                    }
                </style>
            </head>

            <body>

            <header>
                <b>ShopNest</b>

                <nav>
                    <a href="/dashboard">Home</a>
                    <a href="/cart">Cart</a>
                    <a href="/logout">Logout</a>
                </nav>
            </header>

            <div class="container">

                <h1>My Orders</h1>

                ${
                    orders.length === 0
                    ?
                    `<div class="order">
                        <h3>No orders yet.</h3>
                        <a href="/dashboard">Start Shopping</a>
                    </div>`
                    :
                    orders.map(order => `
                        <div class="order">

                            <h2>Order #${order.id}</h2>

                            <p>
                                <b>Total:</b>
                                ₹${Number(order.total_amount).toFixed(2)}
                            </p>

                            <p>
                                <b>Payment:</b>
                                ${order.payment_method}
                            </p>

                            <p>
                                <b>Status:</b>
                                <span class="status">
                                    ${order.status}
                                </span>
                            </p>

                            <p>
                                <b>Date:</b>
                                ${new Date(order.created_at).toLocaleString()}
                            </p>

                        </div>
                    `).join("")
                }

            </div>

            </body>
            </html>
        `);

    } catch (error) {

        console.error("Orders error:", error);
        res.status(500).send("Unable to load orders.");

    }

});
/* =========================
   ADMIN LOGIN
========================= */

app.get("/admin/login", (req, res) => {
    res.render("admin/login");
});

app.post("/admin/login", async (req, res) => {

    const { email, password } = req.body;

    try {

        const [users] = await db.promise().query(
            "SELECT * FROM users WHERE email = ? AND role = 'admin'",
            [email]
        );

        if (users.length === 0) {
            return res.send(`
                <h2>Invalid admin login</h2>
                <a href="/admin/login">Try Again</a>
            `);
        }

        const admin = users[0];

        const match = await bcrypt.compare(
            password,
            admin.password
        );

        if (!match) {
            return res.send(`
                <h2>Invalid admin login</h2>
                <a href="/admin/login">Try Again</a>
            `);
        }

        req.session.userId = admin.id;
        req.session.userName = admin.name;
        req.session.role = "admin";

        res.redirect("/admin");

    } catch (error) {
        console.error(error);
        res.status(500).send("Admin login failed.");
    }
});


/* =========================
   ADMIN DASHBOARD
========================= */

app.get("/admin", async (req, res) => {

    if (!req.session.userId || req.session.role !== "admin") {
        return res.redirect("/admin/login");
    }

    try {

        const [[products]] = await db.promise().query(
            "SELECT COUNT(*) AS count FROM products"
        );

        const [[customers]] = await db.promise().query(
            "SELECT COUNT(*) AS count FROM users WHERE role = 'user'"
        );

        const [[orders]] = await db.promise().query(
            "SELECT COUNT(*) AS count FROM orders"
        );

        res.render("admin/dashboard", {
            productCount: products.count,
            customerCount: customers.count,
            orderCount: orders.count
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load admin dashboard.");
    }
});


/* =========================
   ADD PRODUCT PAGE
========================= */

app.get("/admin/products", (req, res) => {

    if (req.session.role !== "admin") {
        return res.redirect("/admin/login");
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Add Product - ShopNest</title>
            <style>
                body{font-family:Arial;background:#f5f6fa}
                .box{background:white;width:500px;margin:40px auto;padding:30px;border-radius:15px}
                input,textarea{width:100%;padding:12px;margin:8px 0 15px;box-sizing:border-box}
                button{width:100%;padding:13px;background:#5b4bc4;color:white;border:0;border-radius:7px}
                a{display:inline-block;margin-top:15px}
            </style>
        </head>
        <body>

        <div class="box">

            <h1>Add Product</h1>

            <form action="/admin/add-product" method="POST">

                <input name="name" placeholder="Product Name" required>

                <textarea name="description"
                    placeholder="Description"></textarea>

                <input name="price"
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    required>

                <input name="category"
                    placeholder="Category">

                <input name="image"
                    placeholder="Image URL">

                <input name="stock"
                    type="number"
                    placeholder="Stock"
                    required>

                <button>Add Product</button>

            </form>

            <a href="/admin">← Dashboard</a>

        </div>

        </body>
        </html>
    `);
});


/* =========================
   ADD PRODUCT
========================= */

app.post("/admin/add-product", async (req, res) => {

    if (req.session.role !== "admin") {
        return res.redirect("/admin/login");
    }

    const {
        name,
        description,
        price,
        category,
        image,
        stock
    } = req.body;

    try {

        await db.promise().query(
            `INSERT INTO products
            (name, description, price, category, image, stock)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                name,
                description,
                price,
                category,
                image,
                stock
            ]
        );

        res.send(`
            <h2>Product added successfully!</h2>
            <a href="/admin/products">Add Another</a>
            <br>
            <a href="/admin">Admin Dashboard</a>
        `);

    } catch (error) {

        console.error(error);
        res.status(500).send("Unable to add product.");

    }
});


/* =========================
   VIEW CUSTOMERS
========================= */

app.get("/admin/customers", async (req, res) => {

    if (req.session.role !== "admin") {
        return res.redirect("/admin/login");
    }

    try {

        const [customers] = await db.promise().query(
            `SELECT id, name, email, phone, created_at
             FROM users
             WHERE role = 'user'
             ORDER BY id DESC`
        );

        res.send(`
            <h1>ShopNest - Customers</h1>

            <table border="1" cellpadding="12" cellspacing="0">
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Registered</th>
                </tr>

                ${customers.map(c => `
                    <tr>
                        <td>${c.id}</td>
                        <td>${c.name}</td>
                        <td>${c.email}</td>
                        <td>${c.phone || "-"}</td>
                        <td>${new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                `).join("")}

            </table>

            <br>
            <a href="/admin">← Admin Dashboard</a>
        `);

    } catch (error) {

        console.error(error);
        res.status(500).send("Unable to load customers.");

    }
});


/* =========================
   VIEW ORDERS
========================= */

app.get("/admin/orders", async (req, res) => {

    if (req.session.role !== "admin") {
        return res.redirect("/admin/login");
    }

    try {

        const [orders] = await db.promise().query(
            `SELECT
                orders.id,
                users.name,
                users.email,
                orders.total_amount,
                orders.payment_method,
                orders.status,
                orders.created_at
             FROM orders
             JOIN users
             ON orders.user_id = users.id
             ORDER BY orders.id DESC`
        );

        res.send(`
            <h1>ShopNest - Orders</h1>

            <table border="1" cellpadding="12" cellspacing="0">

                <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Date</th>
                </tr>

                ${orders.map(o => `
                    <tr>
                        <td>#${o.id}</td>
                        <td>${o.name}</td>
                        <td>${o.email}</td>
                        <td>₹${Number(o.total_amount).toFixed(2)}</td>
                        <td>${o.payment_method}</td>
                        <td>${o.status}</td>
                        <td>${new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                `).join("")}

            </table>

            <br>
            <a href="/admin">← Admin Dashboard</a>
        `);

    } catch (error) {

        console.error(error);
        res.status(500).send("Unable to load orders.");

    }
});
/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

    console.log(
        `ShopNest server running at http://localhost:${PORT}`
    );

});