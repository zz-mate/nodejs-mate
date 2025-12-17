import pool from '../../db/index.ts';
class UserModule {
    constructor() {
        this.bookTableName = 'mate_book';
    }
    async findById(book_id, user_id) {
        const [rows] = await pool.execute(`SELECT id
             FROM ${this.bookTableName}
             WHERE id = ? AND user_id=? LIMIT 1`, [book_id, user_id]);
        const book = rows[0];
        return book || null;
    }
}
export default new UserModule();
