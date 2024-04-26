// Import required modules
import express from 'express';
import bodyParser from 'body-parser';
import mysql from 'mysql';
import { fileURLToPath } from 'url';
import path from 'path';
import session from 'express-session';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();


import bcrypt from 'bcrypt';


// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express application
const app = express();
app.set('view engine', 'ejs');

// Middleware to parse request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
  }
});


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Route for homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'home.html'));
});
app.get('/home', (req, res) => {
  res.render(path.join(__dirname, 'views', 'homepage'));
});


app.get('/add', (req, res) => {
  res.render(path.join(__dirname, 'views', 'add'));
});



// Route for login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/base', (req, res) => {
  res.render(path.join(__dirname, 'views', 'base'));
});

// Route for signup page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});





// Registration route
app.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  // Validate input
  if (!username || !email || !password) {
      return res.status(400).send('All fields are required');
  }

  // Check if username already exists
  pool.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
      if (err) {
          console.error('Error checking username:', err);
          return res.status(500).send('Error checking username');
      }

      if (results.length > 0) {
          return res.status(409).send('Username already exists');
      }

      // Hash the password
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
          console.error('Error hashing password:', err);
          return res.status(500).send('Error hashing password');
        }

        // Insert user data into the database with hashed password
        pool.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], (err, results) => {
            if (err) {
                console.error('Error registering user:', err);
                return res.status(500).send('Error registering user');
            }

            // Set user ID in session
            req.session.userId = results.insertId;

            // User registered successfully
            res.redirect('/login');
        });
      });
  });
});



// Login route
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Check if email exists in the database
  pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error('Error checking credentials:', err);
      return res.status(500).send('Error checking credentials');
    }

    if (results.length === 0) {
      return res.status(401).send('Incorrect email or password');
    }

    const user = results[0];

    // Compare hashed password
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error('Error comparing passwords:', err);
        return res.status(500).send('Error comparing passwords');
      }

      if (!isMatch) {
        return res.status(401).send('Incorrect email or password');
      }

      // Set user ID in session
      req.session.userId = user.id;

      // Redirect to homepage after successful login
      res.redirect('/home');
    });
  });
});



// Add expense route
app.post('/addexpense', (req, res) => {
  const { date, expensename, amount, paymode, category } = req.body;

  // Get userId from session
  const userId = req.session.userId;

  // Check if userId is available in the session
  if (!userId) {
    return res.status(401).send('User not authenticated');
  }

  // Debugging: Log userId and request body


  // Execute the MySQL query to insert expense data
  pool.query('INSERT INTO expenses (userid, date, expensename, amount, paymode, category) VALUES (?, ?, ?, ?, ?, ?)', [userId, date, expensename, amount, paymode, category], (error, results, fields) => {
      if (error) {
          console.error('Error adding expense:', error);
          return res.status(500).send('Error adding expense');
      }

      console.log('Expense added successfully');
      
      // Redirect to the display page
      res.redirect('/display');
  });
});




// Route to display expenses
// Route to display expenses
app.get('/display', (req, res) => {
  // Ensure user is authenticated
  if (!req.session.userId) {
    return res.status(401).send('User not authenticated');
  }

  const userId = req.session.userId;

  // Query to fetch spending limit for the logged-in user
  const limitQuery = `SELECT limitss FROM limits WHERE userid = ${userId}`;

  // Execute the MySQL query to fetch spending limit
  pool.query(limitQuery, (limitError, limitResults) => {
    if (limitError) {
      console.error('Error fetching spending limit:', limitError);
      return res.status(500).send('Error fetching spending limit');
    }

    // Check if limitResults is empty
    if (limitResults.length === 0) {
      console.log('Spending limit not set for the user');
      return res.status(404).send('Spending limit not set for the user');
    }

    // Extract spending limit from the query results
    const spendingLimit = limitResults[0].limitss;

    // Query to fetch user's email
    const userEmailQuery = `SELECT email FROM users WHERE id = ${userId}`;

    // Execute the MySQL query to fetch user's email
    pool.query(userEmailQuery, (emailError, emailResults) => {
      if (emailError) {
        console.error('Error fetching user email:', emailError);
        return res.status(500).send('Error fetching user email');
      }

      // Extract user's email from the query results
      const userEmail = emailResults[0].email;

      // Query to fetch expenses for the logged-in user
      const expenseQuery = `SELECT * FROM expenses WHERE userid = ${userId} ORDER BY date DESC`;

      // Execute the MySQL query to fetch expenses
      pool.query(expenseQuery, (expenseError, expenseResults) => {
        if (expenseError) {
          console.error('Error fetching expenses:', expenseError);
          return res.status(500).send('Error fetching expenses');
        }

        // Map field names to desired names for expenses
        const expenses = expenseResults.map(expense => ({
          ID: expense.id,
          USERID: expense.userid,
          DATE: expense.date,
          EXPENSENAME: expense.expensename,
          AMOUNT: expense.amount,
          PAYMODE: expense.paymode,
          CATEGORY: expense.category
        }));

        // Calculate expense breakdown
        let t_food = 0,
          t_entertainment = 0,
          t_business = 0,
          t_rent = 0,
          t_EMI = 0,
          t_other = 0,
          total = 0;

        expenses.forEach(expense => {
          switch (expense.CATEGORY.toLowerCase()) {
            case 'food':
              t_food += expense.AMOUNT;
              break;
            case 'entertainment':
              t_entertainment += expense.AMOUNT;
              break;
            case 'business':
              t_business += expense.AMOUNT;
              break;
            case 'rent':
              t_rent += expense.AMOUNT;
              break;
            case 'emi':
              t_EMI += expense.AMOUNT;
              break;
            default:
              t_other += expense.AMOUNT;
              break;
          }
        });

        // Calculate total spending
        total = t_food + t_entertainment + t_business + t_rent + t_EMI + t_other;

        // Check if total spending exceeds spending limit
        if (total > spendingLimit) {
          // Send email notification to the user
          const mailOptions = {
            from: 'yoursample@gmail.com',
            to: userEmail, // Fetch user's email from the users table
            subject: 'Spending Limit Exceeded',
            html: `<p>Your spending limit of ${spendingLimit} has been exceeded. Your total spending is ${total}.</p>`
          };

          transporter.sendMail(mailOptions, (emailError, info) => {
            if (emailError) {
              console.error('Error sending email:', emailError);
            } else {
              console.log('Email sent:', info.response);
            }
          });
        }

        // Render the display.html template with the fetched expenses and breakdown
        res.render('display', {
          expenses,
          t_food,
          t_entertainment,
          t_business,
          t_rent,
          t_EMI,
          t_other,
          total
        });
      });
    });
  });
});




// Route to delete an expense
app.get('/delete/:id', (req, res) => {
  // Ensure user is authenticated
  if (!req.session.userId) {
    return res.status(401).send('User not authenticated');
  }

  // Extract the expense ID from the request parameters
  const expenseId = req.params.id;

  // Construct the MySQL query to delete the expense
  const query = `DELETE FROM expenses WHERE id = ?`;

  // Execute the MySQL query
  pool.query(query, [expenseId], (error, results, fields) => {
    if (error) {
      console.error('Error deleting expense:', error);
      return res.status(500).send('Error deleting expense');
    }

   
    
    // Redirect to the display page after successful deletion
    res.redirect('/display');
  });
});



// GET route to render the edit form
app.get('/edit/:id', (req, res) => {
  const expenseId = req.params.id;
  // Fetch expense details for editing
  const query = 'SELECT * FROM expenses WHERE id = ?';
  pool.query(query, [expenseId], (error, results) => {
    if (error) {
      console.error('Error fetching expense:', error);
      return res.status(500).send('Error fetching expense');
    }
    if (results.length === 0) {
      return res.status(404).send('Expense not found');
    }
    const expense = results[0];
    res.render('edit', { expenses: [expense] }); // Pass expense as an array to match your template
  });
});


// POST route to handle expense update
app.post('/update/:id', (req, res) => {
  const expenseId = req.params.id;
  
  const { date, expensename, amount, paymode, category } = req.body;

  // Construct the formatted date string
  const formattedDate = `${date.substring(0, 10)} ${date.substring(11, 19)}`;

  // Update the expense in the database
  const query = 'UPDATE expenses SET date = ?, expensename = ?, amount = ?, paymode = ?, category = ? WHERE id = ?';
  pool.query(query, [formattedDate, expensename, amount, paymode, category, expenseId], (error, results) => {
    if (error) {
      console.error('Error updating expense:', error);
      return res.status(500).send('Error updating expense');
    }
    console.log('Successfully updated');
    res.redirect('/display');
  });
});



// Route to set the monthly limit
// Route to set or update the monthly limit
app.post("/limitnum", (req, res) => {
  const { number } = req.body;
  const userId = req.session.userId; // Assuming you have user ID stored in the session
  
  // Check if a limit record already exists for the user
  const query = 'SELECT id FROM limits WHERE userid = ?';
  pool.query(query, [userId], (error, results) => {
    if (error) {
      console.error('Error checking for existing limit:', error);
      return res.status(500).send('Error checking for existing limit');
    }

    if (results.length === 0) {
      // No limit record found for the user, insert a new record
      const insertQuery = 'INSERT INTO limits (userid, limitss) VALUES (?, ?)';
      pool.query(insertQuery, [userId, number], (insertError, insertResults) => {
        if (insertError) {
          console.error('Error setting monthly limit:', insertError);
          return res.status(500).send('Error setting monthly limit');
        }
        return res.redirect('/limit');
      });
    } else {
      // Update the existing limit record for the user
      const updateQuery = 'UPDATE limits SET limitss = ? WHERE userid = ?';
      pool.query(updateQuery, [number, userId], (updateError, updateResults) => {
        if (updateError) {
          console.error('Error updating monthly limit:', updateError);
          return res.status(500).send('Error updating monthly limit');
        }
        return res.redirect('/limit');
      });
    }
  });
});


// Route to retrieve the monthly limit
app.get("/limit", (req, res) => {
  const userId = req.session.userId; // Assuming you have user ID stored in the session
  
  // Fetch the latest limit associated with the user ID
  const query = 'SELECT id, limitss FROM limits WHERE userid = ? ORDER BY id DESC LIMIT 1';
  pool.query(query, [userId], (error, results) => {
      if (error) {
          console.error('Error fetching monthly limit:', error);
          return res.status(500).send('Error fetching monthly limit');
      }
      if (results.length === 0) {
          // No limit set for the user yet
          return res.render('limit', { y: null });
      }
      const limit = results[0].limitss;
      return res.render('limit', { y: limit });
  });
});



app.get("/today", (req, res) => {
  const userId = req.session.userId; // Assuming you have user ID stored in the session
  
  // Query to fetch today's expenses for the logged-in user
  const todayExpensesQuery = `SELECT TIME(date) as tn, amount FROM expenses WHERE userid = ? AND DATE(date) = CURDATE() ORDER BY date DESC`;
  
  // Query to fetch all today's expenses details for the logged-in user
  const expensesQuery = `SELECT * FROM expenses WHERE userid = ? AND DATE(date) = CURDATE() ORDER BY date DESC`;
  
  // Execute the MySQL queries
  pool.query(todayExpensesQuery, [userId], (error1, todayExpenses) => {
    if (error1) {
      console.error('Error fetching today\'s expenses:', error1);
      return res.status(500).send('Error fetching today\'s expenses');
    }
    
    pool.query(expensesQuery, [userId], (error2, expenses) => {
      if (error2) {
        console.error('Error fetching today\'s expenses details:', error2);
        return res.status(500).send('Error fetching today\'s expenses details');
      }
      
      // Calculate total and category-wise totals
      let total = 0;
      let t_food = 0;
      let t_entertainment = 0;
      let t_business = 0;
      let t_rent = 0;
      let t_EMI = 0;
      let t_other = 0;
      
      expenses.forEach(expense => {
        total += expense.amount;
        switch (expense.category) {
          case 'food':
            t_food += expense.amount;
            break;
          case 'entertainment':
            t_entertainment += expense.amount;
            break;
          case 'business':
            t_business += expense.amount;
            break;
          case 'rent':
            t_rent += expense.amount;
            break;
          case 'EMI':
            t_EMI += expense.amount;
            break;
          case 'other':
            t_other += expense.amount;
            break;
          default:
            break;
        }
      });
      
      // Render the today.html template with the fetched data
      res.render("today", { texpense: todayExpenses, expense: expenses, total: total, 
                            t_food: t_food, t_entertainment: t_entertainment,
                            t_business: t_business, t_rent: t_rent, 
                            t_EMI: t_EMI, t_other: t_other });
    });
  });
});




app.get('/month', (req, res) => {
  const userId = req.session.userId; // Assuming userId is stored in the session
  
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are zero-based
  const currentYear = currentDate.getFullYear();
  const currentDay = currentDate.getDate();

  // Construct the date string for the current date in YYYY-MM-DD format
  const currentDateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

  const query1 = `SELECT DATE(date) AS dt, SUM(amount) AS tot FROM expenses WHERE userid = ? AND DATE(date) <= ? AND MONTH(date) = ? AND YEAR(date) = ? GROUP BY DATE(date) ORDER BY DATE(date)`;
  const params1 = [userId, currentDateStr, currentMonth, currentYear];

  pool.query(query1, params1, (err, result1) => {
    if (err) {
      throw err;
    }

    const texpense = result1;

    const query2 = `SELECT * FROM expenses WHERE userid = ? AND DATE(date) <= ? AND MONTH(date) = ? AND YEAR(date) = ? ORDER BY date DESC`;
    const params2 = [userId, currentDateStr, currentMonth, currentYear];

    pool.query(query2, params2, (err, result2) => {
      if (err) {
        throw err;
      }

      const expense = result2;

      let total = 0;
      let t_food = 0;
      let t_entertainment = 0;
      let t_business = 0;
      let t_rent = 0;
      let t_EMI = 0;
      let t_other = 0;

      expense.forEach((x) => {
        total += x.amount;
        switch (x.category) {
          case 'food':
            t_food += x.amount;
            break;
          case 'entertainment':
            t_entertainment += x.amount;
            break;
          case 'business':
            t_business += x.amount;
            break;
          case 'rent':
            t_rent += x.amount;
            break;
          case 'EMI':
            t_EMI += x.amount;
            break;
          case 'other':
            t_other += x.amount;
            break;
        }
      });


      res.render('month', {
        texpense: texpense,
        expense: expense,
        total: total,
        t_food: t_food,
        t_entertainment: t_entertainment,
        t_business: t_business,
        t_rent: t_rent,
        t_EMI: t_EMI,
        t_other: t_other
      });
    });
  });
});




app.get('/year', (req, res) => {
  const userId = req.session.userId; // Assuming userId is stored in the session

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();

  // Construct the date string for the current date in YYYY-MM-DD format
  const currentDateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

  const query1 = `SELECT MONTH(date) AS mn, SUM(amount) AS tot FROM expenses WHERE userid = ? AND YEAR(date) = ? GROUP BY MONTH(date) ORDER BY MONTH(date)`;
  const params1 = [userId, currentYear];

  pool.query(query1, params1, (err, result1) => {
    if (err) {
      throw err;
    }

    const texpense = result1;

    const query2 = `SELECT * FROM expenses WHERE userid = ? AND YEAR(date) = ? AND DATE(date) <= ? ORDER BY date DESC`;
    const params2 = [userId, currentYear, currentDateStr];

    pool.query(query2, params2, (err, result2) => {
      if (err) {
        throw err;
      }

      const expense = result2;

      let total = 0;
      let t_food = 0;
      let t_entertainment = 0;
      let t_business = 0;
      let t_rent = 0;
      let t_EMI = 0;
      let t_other = 0;

      expense.forEach((x) => {
        total += x.amount;
        switch (x.category) {
          case 'food':
            t_food += x.amount;
            break;
          case 'entertainment':
            t_entertainment += x.amount;
            break;
          case 'business':
            t_business += x.amount;
            break;
          case 'rent':
            t_rent += x.amount;
            break;
          case 'EMI':
            t_EMI += x.amount;
            break;
          case 'other':
            t_other += x.amount;
            break;
        }
      });


      res.render('year', {
        texpense: texpense,
        expense: expense,
        total: total,
        t_food: t_food,
        t_entertainment: t_entertainment,
        t_business: t_business,
        t_rent: t_rent,
        t_EMI: t_EMI,
        t_other: t_other
      });
    });
  });
});



app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.sendFile(path.join(__dirname, 'views', 'home.html')); // Assuming home.html is the template for your home page
  });
});



// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
