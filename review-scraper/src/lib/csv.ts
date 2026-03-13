interface Review {
  userName: string;
  score: number;
  date: string;
  text: string;
}

/**
 * Converts an array of reviews to RFC 4180 CSV format.
 * - Always includes header: "userName,score,date,text\n"
 * - Escapes fields with commas, quotes, or newlines by wrapping in quotes
 * - Escapes internal quotes as doubled quotes ("")
 * - No external dependencies
 */
export function reviewsToCSV(reviews: Review[]): string {
  const header = "userName,score,date,text\n";

  if (reviews.length === 0) {
    return header;
  }

  const rows = reviews.map((review) => {
    const fields = [review.userName, String(review.score), review.date, review.text];
    return fields.map(escapeCSVField).join(",");
  });

  return header + rows.join("\n") + "\n";
}

/**
 * Escapes a single CSV field according to RFC 4180.
 * If field contains comma, quote, or newline, wrap in quotes and escape internal quotes as "".
 */
function escapeCSVField(field: string): string {
  // If field contains comma, quote, or newline, escape it
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    // Escape quotes by doubling them
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return field;
}
