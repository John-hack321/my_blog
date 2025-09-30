import type { AstroIntegration } from "@swup/astro";

// Extend the Window interface
declare global {
  interface Window {
    // type from '@swup/astro' is incorrect
    swup: AstroIntegration;
    pagefind: {
      search: (query: string) => Promise<{
        results: Array<{
          data: () => Promise<SearchResult>;
        }>;
      }>;
    };
    
    // Google Analytics
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }

  // Global gtag function
  const gtag: (...args: any[]) => void;
  
  // Global dataLayer
  const dataLayer: any[];
}

interface SearchResult {
	url: string;
	meta: {
		title: string;
	};
	excerpt: string;
	content?: string;
	word_count?: number;
	filters?: Record<string, unknown>;
	anchors?: Array<{
		element: string;
		id: string;
		text: string;
		location: number;
	}>;
	weighted_locations?: Array<{
		weight: number;
		balanced_score: number;
		location: number;
	}>;
	locations?: number[];
	raw_content?: string;
	raw_url?: string;
	sub_results?: SearchResult[];
}
