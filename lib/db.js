// lib/db.js - Database interface using Supabase (PostgreSQL)
import { supabase } from './supabase';

const TABLE_NAME = 'products';

const fieldMap = {
  envioGratis: 'envio_gratis',
  mercadoLibreUrl: 'mercado_libre_url'
};

function toSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = fieldMap[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[newKey] = value;
  }
  return result;
}

function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[newKey] = value;
  }
  return result;
}

export async function connectToDatabase() {
  return { 
    client: supabase, 
    db: {
      collection: (name) => new MongoCollection(name)
    }
  };
}

class MongoCollection {
  constructor(name) {
    this.tableName = name;
  }

  find(query = {}) {
    const self = this;
    let data = null;
    let loaded = false;
    
    return {
      async hasNext() {
        if (!loaded) {
          const result = await supabase
            .from(self.tableName)
            .select('*')
            .match(query)
            .limit(1000);
          if (result.error) throw result.error;
          data = result.data || [];
          loaded = true;
        }
        return data.length > 0;
      },
      async next() {
        if (!loaded) {
          const result = await supabase
            .from(self.tableName)
            .select('*')
            .match(query)
            .limit(1000);
          if (result.error) throw result.error;
          data = result.data || [];
          loaded = true;
        }
        const item = data.shift();
        return item ? toCamelCase(item) : null;
      }
    };
  }

  async findOne(query) {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .match(query)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data ? toCamelCase(data) : null;
  }

  async countDocuments(query = {}) {
    const { count, error } = await supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .match(query);
    
    if (error) throw error;
    return count || 0;
  }

  async insertOne(doc) {
    const docSnake = toSnakeCase(doc);
    const { data, error } = await supabase
      .from(this.tableName)
      .insert(docSnake)
      .select()
      .single();
    
    if (error) throw error;
    return toCamelCase(data);
  }

  async updateOne(query, update) {
    const { $set } = update;
    const $setSnake = toSnakeCase($set);
    const { data, error } = await supabase
      .from(this.tableName)
      .update($setSnake)
      .match(query)
      .select()
      .single();
    
    if (error) throw error;
    return toCamelCase(data);
  }

  async deleteOne(query) {
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .match(query);
    
    if (error) throw error;
    return { deletedCount: error ? 0 : 1 };
  }

  async replaceOne(query, doc, options = {}) {
    const { upsert } = options;
    const docSnake = toSnakeCase(doc);
    
    const existing = await this.findOne(query);
    
    if (existing) {
      const { data, error } = await supabase
        .from(this.tableName)
        .update(docSnake)
        .match(query)
        .select()
        .single();
      
      if (error) throw error;
      return { matchedCount: 1, modifiedCount: 1 };
    } else if (upsert) {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert(docSnake)
        .select()
        .single();
      
      if (error) throw error;
      return { matchedCount: 0, upsertedCount: 1, upsertedId: doc.id };
    }
    
    return { matchedCount: 0 };
  }

  async bulkWrite(ops, options = {}) {
    let upsertedCount = 0;
    let modifiedCount = 0;
    
    for (const op of ops) {
      if (op.replaceOne) {
        const { filter, replacement, upsert } = op.replaceOne;
        const result = await this.replaceOne(filter, replacement, { upsert });
        if (result.upsertedCount) upsertedCount++;
        if (result.modifiedCount) modifiedCount++;
      } else if (op.insertOne) {
        await this.insertOne(op.insertOne.document);
        upsertedCount++;
      } else if (op.updateOne) {
        await this.updateOne(op.updateOne.filter, op.updateOne.update);
        modifiedCount++;
      }
    }
    
    return { upsertedCount, modifiedCount };
  }

  async drop() {
    const { error } = await supabase.from(this.tableName).delete().neq('id', '');
    if (error) throw error;
    return true;
  }
}
