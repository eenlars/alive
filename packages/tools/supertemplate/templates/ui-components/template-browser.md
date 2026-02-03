---
name: Template Browser
description: A template browser component that displays available templates as cards with search and selection.
category: ui-components
complexity: 2
files: 3
dependencies: []
estimatedTime: "10 min"
tags:
  - ui
  - browser
  - templates
  - cards
  - search
requires:
  - React 18+
previewImage: https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop
enabled: false
---

# Template Browser - Quick Template Selector

A beautiful template browser component that displays available templates as cards. Users can browse, search, and select templates to scaffold new features. Perfect for platforms offering multiple implementation patterns.

## Step-by-Step Implementation

### Step 1: Create Template Data Type

Create `src/lib/templates.ts`:

```tsx
export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'ui' | 'forms' | 'maps' | 'data' | 'animations';
  complexity: 1 | 2 | 3;
  files: number;
  dependencies: string[];
  estimatedTime: string;
  icon: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'carousel-thumbnails',
    name: 'Auto-Scrolling Carousel',
    description: 'Smooth carousel that continuously scrolls images infinitely with thumbnail navigation.',
    category: 'ui',
    complexity: 2,
    files: 1,
    dependencies: [],
    estimatedTime: '4-5 minutes',
    icon: '🎠',
  },
  {
    id: 'map-basic-markers',
    name: 'Interactive Map with Markers',
    description: 'Leaflet map with custom markers and popups. Click markers to see location details.',
    category: 'maps',
    complexity: 2,
    files: 2,
    dependencies: ['leaflet'],
    estimatedTime: '4-5 minutes',
    icon: '🗺️',
  },
  {
    id: 'form-validation',
    name: 'Form with Validation',
    description: 'Complete form with real-time validation, error handling, and submission feedback.',
    category: 'forms',
    complexity: 2,
    files: 2,
    dependencies: ['react-hook-form', 'zod'],
    estimatedTime: '5-7 minutes',
    icon: '📝',
  },
  {
    id: 'data-table',
    name: 'Sortable Data Table',
    description: 'Interactive table with sorting, filtering, and pagination for displaying datasets.',
    category: 'data',
    complexity: 3,
    files: 2,
    dependencies: [],
    estimatedTime: '8-10 minutes',
    icon: '📊',
  },
  {
    id: 'animations',
    name: 'Smooth Animations',
    description: 'Reusable animation library with fade-in, slide, zoom effects using CSS transforms.',
    category: 'animations',
    complexity: 1,
    files: 1,
    dependencies: [],
    estimatedTime: '3-4 minutes',
    icon: '✨',
  },
];

export function getTemplatesByCategory(category: Template['category']): Template[] {
  return TEMPLATES.filter(t => t.category === category);
}

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id);
}
```

### Step 2: Create the Template Browser Component

Create `src/components/TemplateBrowser.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { TEMPLATES, type Template } from '../lib/templates';

type Category = 'all' | 'ui' | 'forms' | 'maps' | 'data' | 'animations';

interface TemplateBrowserProps {
  onSelectTemplate?: (template: Template) => void;
}

export const TemplateBrowser = ({ onSelectTemplate }: TemplateBrowserProps) => {
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = useMemo(() => {
    let result = TEMPLATES;

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter(t => t.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [selectedCategory, searchQuery]);

  const categories: { value: Category; label: string }[] = [
    { value: 'all', label: 'All Templates' },
    { value: 'ui', label: 'UI Components' },
    { value: 'forms', label: 'Forms' },
    { value: 'maps', label: 'Maps' },
    { value: 'data', label: 'Data' },
    { value: 'animations', label: 'Animations' },
  ];

  const complexityColor = (complexity: number) => {
    switch (complexity) {
      case 1:
        return 'bg-green-100 text-green-800';
      case 2:
        return 'bg-yellow-100 text-yellow-800';
      case 3:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const complexityLabel = (complexity: number) => {
    switch (complexity) {
      case 1:
        return 'Beginner';
      case 2:
        return 'Intermediate';
      case 3:
        return 'Advanced';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Browse Templates</h1>
          <p className="text-gray-600">
            Select a template to quickly scaffold common patterns
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute right-4 top-3 text-gray-400">🔍</span>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-500'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => onSelectTemplate?.(template)}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden group"
            >
              {/* Card Header */}
              <div className="p-6 border-b border-gray-200 group-hover:bg-blue-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-4xl">{template.icon}</span>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${complexityColor(template.complexity)}`}>
                    {complexityLabel(template.complexity)}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{template.name}</h3>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 line-clamp-2">
                  {template.description}
                </p>

                {/* Stats */}
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <span>📄</span>
                    <span>{template.files} file{template.files !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>⏱️</span>
                    <span>{template.estimatedTime}</span>
                  </div>
                </div>

                {/* Dependencies */}
                {template.dependencies.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Dependencies:</p>
                    <div className="flex flex-wrap gap-2">
                      {template.dependencies.map((dep) => (
                        <span
                          key={dep}
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Select Button */}
                <button className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {filteredTemplates.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg text-gray-600 mb-2">No templates found</p>
            <p className="text-sm text-gray-500">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Step 3: Use in Your Page

Update `src/pages/Index.tsx`:

```tsx
import { TemplateBrowser } from '../components/TemplateBrowser';
import type { Template } from '../lib/templates';

const Index = () => {
  const handleSelectTemplate = (template: Template) => {
    console.log('Selected template:', template.name);
    // You could:
    // - Navigate to a detail page
    // - Show a modal with implementation steps
    // - Copy code to clipboard
    // - Start a guided installation flow
  };

  return <TemplateBrowser onSelectTemplate={handleSelectTemplate} />;
};

export default Index;
```

## How It Works

1. **Template Data**: `TEMPLATES` array contains all available templates with metadata (complexity, dependencies, time estimate).

2. **Filtering**: Search and category filters work together using `useMemo` to efficiently find matching templates.

3. **Visual Hierarchy**: Cards show:
   - Icon and title
   - Complexity badge (color-coded)
   - Description
   - File and time estimates
   - Dependencies (if any)
   - Call-to-action button

4. **State Management**: Two pieces of state (`selectedCategory` and `searchQuery`) drive the filtered results.

5. **Responsive Grid**: Uses Tailwind's responsive grid that adapts: 1 column on mobile, 2 on tablet, 3 on desktop.

## Customization Examples

### Add Tags to Templates

Add a `tags` field to Template interface:

```tsx
export interface Template {
  // ... existing fields
  tags: string[];
}

// Then filter by tags:
const [selectedTag, setSelectedTag] = useState<string | null>(null);

const filteredTemplates = useMemo(() => {
  let result = TEMPLATES;
  if (selectedTag) {
    result = result.filter(t => t.tags.includes(selectedTag));
  }
  return result;
}, [selectedTag]);
```

### Show Template Details Modal

```tsx
const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

// In the JSX:
{selectedTemplate && (
  <TemplateModal
    template={selectedTemplate}
    onClose={() => setSelectedTemplate(null)}
  />
)}
```

### Add "Recently Used" Section

```tsx
const recentTemplates = JSON.parse(localStorage.getItem('recentTemplates') || '[]');

// Display in a separate section at the top
<div className="space-y-4">
  <h2>Recently Used</h2>
  <div className="grid grid-cols-3 gap-4">
    {recentTemplates.map(id => (
      <TemplateCard key={id} template={TEMPLATES.find(t => t.id === id)} />
    ))}
  </div>
</div>
```

## Important Notes

- **Search Performance**: Uses `useMemo` to avoid filtering on every render
- **No External UI Library**: Uses only Tailwind CSS for styling (already included)
- **Emoji Icons**: Templates use emoji for quick visual identification
- **Extensible**: Easy to add new templates, categories, or metadata
- **Callback Pattern**: The `onSelectTemplate` callback lets you handle template selection however you want

Ready to implement this template
