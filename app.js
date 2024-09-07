import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import data from './db/conc.mjs';
import mime from 'mime-types';
import nodemailer from "nodemailer";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Set the views directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json()); // Add this middleware

// Choose Admin or Student
app.get('/', (req, res) => {
    res.render('home');
});

app.get('/chs', (req, res) => {
    res.render('chs');
});
// Route to display registered users
app.get('/std-det', async (req, res) => {
    try {
        const [users] = await data.query('SELECT student_id, full_name, Email, branch, gender FROM users');
        res.render('std-det', { users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Error fetching users.');
    }
});

app.get('/reg', (req, res) => {
    res.render('chs');
});

// Route for the login page
app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/std', async (req, res) => {
    res.render('std');
});

// Route for the registration page
app.get('/mno', (req, res) => {
    res.render('parti');
});

// Registration Route
app.post('/reg', async (req, res) => {
    const { id, un, emid, category, gender, pass } = req.body;
    const { sortField = 'upload_date', sortOrder = 'ASC' } = req.body;

    try {
        await data.query(
            'INSERT INTO users (student_id, full_name, EMail, branch, gender, password) VALUES (?, ?, ?, ?, ?, ?)',
            [id, un, emid, category, gender, pass]
        );

        // Retrieve the user's information from the database
        const [rows] = await data.query('SELECT * FROM users WHERE student_id = ?', [id]);
        const user = rows[0];
        let [files] = await data.query(`SELECT id, name, description, upload_date, noti_type, class FROM files WHERE class = 'all' OR class = ? ORDER BY ${sortField} ${sortOrder}`, [user.branch]);
        const formattedFiles = files.map(file => ({
            ...file,
            upload_date: formatDate(file.upload_date)
        }));
        res.render('std', { files: formattedFiles, user, sortField, sortOrder, emid });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.redirect('/chs?regError=User%20already%20exist%20with%20the%20same%20Email%20or%20Student%20ID');
            console.error('Duplicate entry error:', error);
        } else {
            console.error('Error registering user:', error);
            res.redirect('/chs?regError=Error%20registering%20user.');
        }
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const {  un, id, pass, role, sortField = 'upload_date', sortOrder = 'ASC' } = req.body;
        let rows, files, user;
        if (role === 'admin') {
            [rows] = await data.query('SELECT id, full_name, password FROM admin WHERE id = ?', [id]);
            if (rows.length === 0) {
                res.redirect('/chs?loginError=User%20not%20found.');
                return;
            }

            user = rows[0];
            if (user.password !== pass) {
                res.redirect('/chs?loginError=Incorrect%20password.');
                return;
            }

            if (user.full_name !== un) {
                res.redirect('/chs?loginError=Incorrect%20username.');
                return;
            }
                
            [files] = await data.query(`SELECT id, name, description, upload_date, noti_type, class FROM files  ORDER BY ${sortField} ${sortOrder}`);
            const formattedFiles = files.map(file => ({
                ...file,
                upload_date: formatDate(file.upload_date)
            }));
            res.render('core', { files: formattedFiles, user, sortField, sortOrder });
        } else {
            const { id, un, pass, sortField = 'upload_date', sortOrder = 'DESC' } = req.body;
            [rows] = await data.query('SELECT student_id, full_name, password, Email, branch FROM users WHERE student_id = ?', [id]);
            if (rows.length === 0) {
                res.redirect('/chs?loginError=User%20not%20found.');
                return;
            }

            user = rows[0];

            if (user.password !== pass) {
                res.redirect('/chs?loginError=Incorrect%20password.');
                return;
            }

            if (user.full_name !== un) {
                res.redirect('/chs?loginError=Incorrect%20username.');
                return;
            }

            [files] = await data.query(`SELECT id, name, description, upload_date, noti_type, class FROM files WHERE class = 'all' OR class = ? ORDER BY ${sortField} ${sortOrder}`, [user.branch]);
            const formattedFiles = files.map(file => ({
                ...file,
                upload_date: formatDate(file.upload_date)
            }));
            res.render('std', { files: formattedFiles, user, sortField, sortOrder });
        }

        console.log('Query result:', rows);
    } catch (error) {
        res.redirect('/chs?loginError=Error%20logging%20in.');
        console.error('Error logging in:', error);
    }
});

//Route for the Home page
app.get('/core', async(req, res) => {
    try {
        const { id, pass, role, sortField = 'upload_date', sortOrder = 'ASC' } = req.body;
        let rows, files, user;

            [files] = await data.query(`SELECT id, name, description, upload_date, noti_type, class FROM files  ORDER BY ${sortField} ${sortOrder}`);
            const formattedFiles = files.map(file => ({
                ...file,
                upload_date: formatDate(file.upload_date)
            }));
            res.render('core', { files: formattedFiles, user, sortField, sortOrder });
        } 
    catch (error) {
        res.redirect('/chs?loginError=Error%20logging%20in.');
        console.error('Error logging in:', error);
    }
});

// File Upload Route
app.post('/upload', upload.single('file'), async (req, res) => {
    const { description, noti, cls, uploadDate, eventName } = req.body;
    const { originalname, buffer } = req.file; // Use buffer for memory storage

    // Automatically detect MIME type
    const mimeType = mime.lookup(originalname) || 'application/octet-stream';

    try {
        if (noti === 'Event') {
            await data.query('INSERT INTO files (name, description, mime_type, data, noti_type, class, upload_date, eventName) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [originalname, description, mimeType, buffer, noti, cls, uploadDate, eventName]);

            if (eventName) {
                const formattedEventName = eventName.replace(/\s+/g, '_').toLowerCase();
                const tableName = `${formattedEventName}`;

                // Debugging: Print the tableName to verify its format
                console.log(`Creating table: ${tableName}`);

                // Create a new table for the event participants if the notification type is "Event"
                await data.query(`CREATE TABLE IF NOT EXISTS ${tableName} (
                    id INT(6) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    class VARCHAR(255) NOT NULL
                )`);

                console.log(`Table created or already exists: ${tableName}`);
            }
        } else {
            await data.query('INSERT INTO files (name, description, mime_type, data, noti_type, class, upload_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [originalname, description, mimeType, buffer, noti, cls, uploadDate]);
        }

        
        let users;

        if (cls === 'All') {
            // Fetch all users if class is "All"
            [users] = await data.query('SELECT EMail FROM users');
        } else if(cls === 'BCA') {
            // Fetch users whose branch matches the selected class
            [users] = await data.query('SELECT EMail FROM users WHERE branch = ?', [cls]);
        } else {
            // Fetch users whose branch matches the selected class
            [users] = await data.query('SELECT EMail FROM users WHERE branch = ?', [cls]);
        }

        if (users.length > 0) {
            // Set up nodemailer transport
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'kumakales8@gmail.com',
                    pass: 'veul sjlt xhfl jovz' // Use environment variable in production
                }
            });

            // Prepare email options
            const mailOptions = {
                from: 'kumakales8@gmail.com',
                to: users.map(user => user.EMail).join(','), // Send to all matching users
                subject: 'New Notification',
                text: description
            };

            // Send the email
            await transporter.sendMail(mailOptions);
        }

        res.redirect('/files?message=uploaded and email sent'); // Redirect with message
    } catch (error) {
        console.error('uploaded and email sent:', error);
        res.redirect('/files?message=error'); // Redirect with error message
    }
});

// File Download Route
app.get('/download/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await data.query('SELECT name, data, description, mime_type, upload_date, class FROM files WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('File not found.');
        }

        const file = rows[0];
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Type', file.mime_type);
        res.send(file.data);
    } catch (error) {
        console.error('Error downloading file from database:', error);
        res.status(500).send('Error downloading file from database.');
    }
});

// File Delete Route
app.get('/delete/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Fetch the event name associated with the file
        const [fileRows] = await data.query('SELECT eventName FROM files WHERE id = ?', [id]);
        if (fileRows.length === 0) {
            return res.status(404).send('File not found.');
        }

        const eventName = fileRows[0].eventName;

        // If the file is associated with an event, delete the event's table
        if (eventName) {
            const formattedEventName = eventName.replace(/\s+/g, '_').toLowerCase();
            const tableName = `${formattedEventName}`;

            // Debugging: Print the tableName to verify its format
            console.log(`Dropping table: ${tableName}`);

            // Drop the table associated with the event
            await data.query(`DROP TABLE IF EXISTS ??`, [tableName]);

            console.log(`Table dropped: ${tableName}`);
        }

        // Delete the file from the database
        await data.query('DELETE FROM files WHERE id = ?', [id]);
        res.redirect('/files?message=deleted'); // Redirect with message
    } catch (error) {
        console.error('Error deleting file from database:', error);
        res.redirect('/files?message=error'); // Redirect with error message
    }
});

// File Sorting Route (core.ejs)
app.get('/files', async (req, res) => {
    const { sortField = 'upload_date', sortOrder = 'DESC' } = req.query;
    try {
        const [files] = await data.query(`SELECT id, name, description, upload_date, noti_type, class FROM files ORDER BY ${sortField} ${sortOrder}`);
        const formattedFiles = files.map(file => ({
            ...file,
            upload_date: formatDate(file.upload_date)
        }));
        res.render('core', { files: formattedFiles, sortField, sortOrder });
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).send('Error fetching files.');
    }
});

// Participants Route
app.get('/participants/:fileId', async (req, res) => {
    const { fileId } = req.params;

    try {
        const [fileRows] = await data.query('SELECT eventName FROM files WHERE id = ?', [fileId]);
        if (fileRows.length === 0) {
            return res.status(404).send('Event not found.');
        }

        const eventName = fileRows[0].eventName;
        const formattedEventName = eventName.replace(/\s+/g, '_').toLowerCase();
        const tableName = `${formattedEventName}`;

        const [participants] = await data.query(`SELECT id, name, class FROM ??`, [tableName]);

        res.render('parti', { participants, eventName });
    } catch (error) {
        console.error('Error fetching participants:', error);
        res.status(500).send('Error fetching participants.');
    }
});

// Utility function to format date
function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0'); // January is 0!
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

// Participation Route
app.post('/participate/:fileId', async (req, res) => {
    const { fileId } = req.params;
    const { participantId, participantName, participantClass } = req.body;

    try {
        const [fileRows] = await data.query('SELECT eventName FROM files WHERE id = ?', [fileId]);
        if (fileRows.length === 0) {
            return res.status(404).send('Event not found.');
        }

        const eventName = fileRows[0].eventName;
        const formattedEventName = eventName.replace(/\s+/g, '_').toLowerCase();
        const tableName = `${formattedEventName}`;

        await data.query(`INSERT INTO ?? (id, name, class) VALUES (?, ?, ?)`, [tableName, participantId, participantName, participantClass]);
        res.status(200).send('Participation successful.');
    } catch (error) {
        console.error('Error adding participant:', error);
        res.status(500).send('Error adding participant.');
    }
});

// Unparticipation Route
app.delete('/unparticipate/:fileId', async (req, res) => {
    const { fileId } = req.params;
    const { participantId } = req.body;

    try {
        const [fileRows] = await data.query('SELECT eventName FROM files WHERE id = ?', [fileId]);
        if (fileRows.length === 0) {
            return res.status(404).send('Event not found.');
        }

        const eventName = fileRows[0].eventName;
        const formattedEventName = eventName.replace(/\s+/g, '_').toLowerCase();
        const tableName = `${formattedEventName}`;

        await data.query(`DELETE FROM ?? WHERE id = ?`, [tableName, participantId]);
        res.status(200).send('Unparticipation successful.');
    } catch (error) {
        console.error('Error removing participant:', error);
        res.status(500).send('Error removing participant.');
    }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:5000`);
});
