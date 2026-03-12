// Common arXiv categories for filtering
const CATEGORIES = [
  { id: 'cs.AI', label: 'Artificial Intelligence' },
  { id: 'cs.CL', label: 'Computation and Language' },
  { id: 'cs.CV', label: 'Computer Vision' },
  { id: 'cs.LG', label: 'Machine Learning' },
  { id: 'cs.NE', label: 'Neural and Evolutionary Computing' },
  { id: 'stat.ML', label: 'Machine Learning (Stat)' },
];

interface CategoryFilterProps {
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
}

export function CategoryFilter({ selectedCategories, onChange }: CategoryFilterProps) {
  const handleToggle = (categoryId: string) => {
    if (selectedCategories.includes(categoryId)) {
      onChange(selectedCategories.filter(id => id !== categoryId));
    } else {
      onChange([...selectedCategories, categoryId]);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-900">Categories</h3>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategories.includes(category.id);
          return (
            <button
              type="button"
              key={category.id}
              onClick={() => handleToggle(category.id)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-600/20'
                  : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
