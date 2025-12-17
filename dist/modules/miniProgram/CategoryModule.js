import pool from '../../db/index.ts';
class UserModule {
    constructor() {
        this.categoryTableName = 'mate_category';
    }
    async findById(category_id) {
        const [rows] = await pool.execute(`SELECT id
             FROM ${this.categoryTableName}
             WHERE id = ?  LIMIT 1`, [category_id]);
        const category = rows[0];
        return category || null;
    }
}
export default new UserModule();
