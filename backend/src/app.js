const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")
const rateLimit = require("express-rate-limit")

const app = express()

// FIX (Sec 3): CORS — only allow requests from the frontend origin
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true // allow cookies to be sent cross-origin
}))

app.use(express.json())
app.use(cookieParser())

// FIX (Sec 2): Rate limiting on auth routes — max 20 requests per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
        message: "Too many requests from this IP, please try again after 15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false
})

/**
 * - Routes required
 */
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")

/**
 * - Use Routes
 */

app.get("/", (req, res) => {
    res.send("Ledger Service is up and running")
})

// Apply rate limiter only to register/login — logout must always be accessible
// so users can invalidate compromised tokens even when rate-limited
const conditionalAuthLimiter = (req, res, next) => {
    if (req.path === "/logout") return next()
    return authLimiter(req, res, next)
}
app.use("/api/auth", conditionalAuthLimiter, authRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRoutes)

// FIX (Sec 4): Global error handler — catches any unhandled errors thrown in
// route handlers or middleware and returns a clean JSON error response
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err)
    res.status(err.status || 500).json({
        message: err.message || "An unexpected error occurred"
    })
})

module.exports = app