import React from 'react';

interface SectionHeaderProps {
  title: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title }) => {
  return (
    <div className="bg-amber-300 border-l-4 border-black px-4 py-2 mb-4 shadow-sm">
      <h2 className="text-lg font-extrabold text-black uppercase tracking-wide">
        {title}
      </h2>
    </div>
  );
};

export default SectionHeader;