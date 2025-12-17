import pool from '../../db/index.ts';
class UserModule {
    constructor() {
        this.userTableName = 'mate_user';
    }
    async findById(user_id) {
        const [rows] = await pool.execute(`SELECT id
             FROM ${this.userTableName}
             WHERE id = ? LIMIT 1`, [user_id]);
        const user = rows[0];
        return user || null;
    }
}
export default new UserModule();
