/**
 * Type declarations for @nekazari/ui-kit
 * These are placeholder types until official types are available
 */

declare module '@nekazari/ui-kit' {
  import { ReactNode, ChangeEvent } from 'react';

  export interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
  }

  export const Button: React.FC<ButtonProps>;

  export interface CardProps {
    padding?: 'sm' | 'md' | 'lg';
    className?: string;
    children?: ReactNode;
  }

  export const Card: React.FC<CardProps>;

  export interface InputProps {
    type?: string;
    value?: string;
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
    min?: number | string;
    max?: number | string;
  }

  export const Input: React.FC<InputProps>;

  export interface SelectOption {
    value: string;
    label: string;
  }

  export interface SelectProps {
    value?: string;
    onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
    options?: SelectOption[];
    className?: string;
  }

  export const Select: React.FC<SelectProps>;
}

