import mysql from 'mysql2/promise'

const data = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'sam123',
    database: 'edunotifier'
})

export default data;