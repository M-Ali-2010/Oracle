import React from 'react';

interface Props {
  children: React.ReactNode;
}

export const ContentContainer: React.FC<Props> = ({ children }) => {
  return (
    <main className="flex flex-1 flex-col">
      {children}
    </main>
  );
};
