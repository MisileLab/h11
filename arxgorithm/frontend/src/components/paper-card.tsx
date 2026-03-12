import Link from 'next/link';
import { Paper } from '@/types/search';

interface PaperCardProps {
  paper: Paper;
  isSaved?: boolean;
  onToggleSave?: (e: React.MouseEvent, paper: Paper) => void;
}

export function PaperCard({ paper, isSaved = false, onToggleSave }: PaperCardProps) {
  // Format date to readable string
  const publishedDate = new Date(paper.published_at * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link href={`/paper/${paper.arxiv_id}`} className="block h-full group relative">
      <div className="flex flex-col h-full p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 hover:border-blue-300">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-2 pr-8">
            <h3 className="text-lg font-semibold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
              {paper.title}
            </h3>
            <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {publishedDate}
            </span>
          </div>
          
          <p className="text-sm text-gray-500 mb-4 line-clamp-1">
            {paper.authors.join(', ')}
          </p>

          <p className="text-sm text-gray-600 line-clamp-3 mb-4">
            {paper.abstract}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {paper.categories.slice(0, 3).map((cat) => (
              <span 
                key={cat} 
                className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
              >
                {cat}
              </span>
            ))}
            {paper.categories.length > 3 && (
              <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                +{paper.categories.length - 3}
              </span>
            )}
          </div>
        </div>

        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => onToggleSave(e, paper)}
            className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-10 ${
              isSaved 
                ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
            aria-label={isSaved ? "Remove from reading list" : "Save to reading list"}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill={isSaved ? "currentColor" : "none"}
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="w-5 h-5"
              role="img"
              aria-labelledby={`save-icon-${paper.arxiv_id}`}
            >
              <title id={`save-icon-${paper.arxiv_id}`}>
                {isSaved ? "Remove from reading list" : "Save to reading list"}
              </title>
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
          </button>
        )}
      </div>
    </Link>
  );
}
