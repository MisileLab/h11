import { describe, it, expect } from 'vitest';
import { reviewsToCSV } from './csv';

interface Review {
  userName: string;
  score: number;
  date: string;
  text: string;
}

describe('reviewsToCSV', () => {
  it('should return header row only for empty array', () => {
    const result = reviewsToCSV([]);
    expect(result).toBe('userName,score,date,text\n');
  });

  it('should convert single basic review to CSV row', () => {
    const reviews: Review[] = [
      {
        userName: 'John Doe',
        score: 5,
        date: '2024-01-15',
        text: 'Great app',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\nJohn Doe,5,2024-01-15,Great app\n'
    );
  });

  it('should quote field containing comma', () => {
    const reviews: Review[] = [
      {
        userName: 'Jane, Smith',
        score: 4,
        date: '2024-01-16',
        text: 'Good, very good',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\n"Jane, Smith",4,2024-01-16,"Good, very good"\n'
    );
  });

  it('should escape double quotes as doubled quotes and quote field', () => {
    const reviews: Review[] = [
      {
        userName: 'Bob "The Builder" Johnson',
        score: 3,
        date: '2024-01-17',
        text: 'He said "excellent"',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\n"Bob ""The Builder"" Johnson",3,2024-01-17,"He said ""excellent"""\n'
    );
  });

  it('should quote field containing newline', () => {
    const reviews: Review[] = [
      {
        userName: 'Alice',
        score: 5,
        date: '2024-01-18',
        text: 'Multiline\ncomment',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\nAlice,5,2024-01-18,"Multiline\ncomment"\n'
    );
  });

  it('should preserve unicode and emoji characters', () => {
    const reviews: Review[] = [
      {
        userName: '李明',
        score: 5,
        date: '2024-01-19',
        text: 'Amazing! 🎉 Perfect app 👍',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\n李明,5,2024-01-19,Amazing! 🎉 Perfect app 👍\n'
    );
  });

  it('should handle multiple reviews', () => {
    const reviews: Review[] = [
      {
        userName: 'User1',
        score: 5,
        date: '2024-01-15',
        text: 'Good',
      },
      {
        userName: 'User2',
        score: 4,
        date: '2024-01-16',
        text: 'Nice',
      },
      {
        userName: 'User3',
        score: 3,
        date: '2024-01-17',
        text: 'OK',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\nUser1,5,2024-01-15,Good\nUser2,4,2024-01-16,Nice\nUser3,3,2024-01-17,OK\n'
    );
  });

  it('should handle complex escaping: comma + quote + newline', () => {
    const reviews: Review[] = [
      {
        userName: 'Complex, User',
        score: 5,
        date: '2024-01-20',
        text: 'Said "hello"\nand "goodbye", wow!',
      },
    ];
    const result = reviewsToCSV(reviews);
    expect(result).toBe(
      'userName,score,date,text\n"Complex, User",5,2024-01-20,"Said ""hello""\nand ""goodbye"", wow!"\n'
    );
  });
});
