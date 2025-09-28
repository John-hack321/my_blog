declare module 'astro-icon' {
  import type { AstroComponentFactory } from 'astro/dist/runtime/server';
  
  interface IconProps {
    name: string;
    size?: string | number;
    class?: string;
    style?: string | Record<string, string | number>;
    title?: string;
    'aria-label'?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
    [key: string]: any;
  }

  const Icon: AstroComponentFactory<IconProps>;
  export default Icon;
  
  export const __esModule: true;
  export const _metadata: any;
}
