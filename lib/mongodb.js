// lib/mongodb.js - Mock MongoDB interface using Supabase
import { supabase } from './supabase';

const TABLE_NAME = 'products';

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

  async find(query = {}) {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .match(query)
      .limit(1000);
    
    if (error) throw error;
    return {
      toArray: async () => data || []
    };
  }

  async findOne(query) {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .match(query)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
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
    const { data, error } = await supabase
      .from(this.tableName)
      .insert(doc)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateOne(query, update) {
    const { $set } = update;
    const { data, error } = await supabase
      .from(this.tableName)
      .update($set)
      .match(query)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteOne(query) {
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .match(query);
    
    if (error) throw error;
    return { deletedCount: error ? 0 : 1 };
  }
}
