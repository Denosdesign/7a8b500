import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}) => {
  const baseStyle = "font-display font-bold uppercase tracking-widest px-8 py-4 text-sm transition-all duration-300 clip-path-polygon disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-squid-pink text-white hover:bg-white hover:text-squid-pink border-2 border-squid-pink shadow-[0_0_15px_rgba(237,27,118,0.5)]",
    secondary: "bg-transparent text-white border-2 border-white hover:bg-white hover:text-black",
    danger: "bg-red-600 text-white hover:bg-red-700 border-2 border-red-600",
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className} relative overflow-hidden`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          PROCESSING
        </span>
      ) : children}
    </button>
  );
};
