/**
 * 灵砚 InkForge - 样式化下拉选择组件
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-01
 *
 * 功能描述：美化的下拉选择菜单，支持主题色、Portal渲染、智能定位
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export default function StyledSelect({ value, onChange, options, placeholder = '请选择' }: StyledSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('click', handleClick);
    }
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);
  const accentColor = selectedOption?.color || 'var(--accent)';

  const handleToggle = () => {
    if (!isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const menuHeight = Math.min(options.length * 48 + 20, 280);
      const showAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      setMenuPos({
        top: showAbove ? rect.top + window.scrollY - menuHeight - 8 : rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 180),
      });
    }
    setIsOpen(!isOpen);
  };

  const dropdown = isOpen && createPortal(
    <div
      style={{
        position: 'absolute',
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        minWidth: '180px',
        background: 'rgba(24, 24, 27, 0.98)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '6px',
        zIndex: 99999,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        maxHeight: '280px',
        overflowY: 'auto',
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => { onChange(option.value); setIsOpen(false); }}
          className="w-full flex items-center gap-3"
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: value === option.value && option.color ? `2px solid ${option.color}` : '2px solid transparent',
            background: value === option.value && option.color ? `linear-gradient(135deg, ${option.color}15 0%, ${option.color}05 100%)` : 'transparent',
            color: value === option.value && option.color ? option.color : 'var(--text-secondary)',
            fontWeight: value === option.value ? '600' : '400',
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: '2px',
          }}
          onMouseEnter={(e) => {
            if (value !== option.value && option.color) {
              e.currentTarget.style.background = `${option.color}10`;
              e.currentTarget.style.color = option.color;
            }
          }}
          onMouseLeave={(e) => {
            if (value !== option.value) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }
          }}
        >
          {option.color && (
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: option.color,
              opacity: value === option.value ? 1 : 0.5,
            }}></span>
          )}
          {option.label}
          {value === option.value && (
            <i className="fa-solid fa-check ml-auto" style={{ fontSize: '11px', color: option.color || 'var(--accent)' }}></i>
          )}
        </button>
      ))}
    </div>,
    document.body
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '160px' }}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between"
        style={{
          padding: '10px 14px',
          background: isOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
          border: `2px solid ${isOpen ? accentColor : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '10px',
          color: accentColor,
          fontWeight: '500',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isOpen ? `0 0 0 3px ${accentColor}20` : 'none',
          minWidth: '160px',
        }}
      >
        <span className="flex items-center gap-2">
          {selectedOption?.color && (
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: selectedOption.color,
              boxShadow: `0 0 8px ${selectedOption.color}60`,
            }}></span>
          )}
          {selectedOption?.label || placeholder}
        </span>
        <i
          className={`fa-solid fa-chevron-down transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ fontSize: '12px', color: accentColor }}
        ></i>
      </button>
      {mounted && dropdown}
    </div>
  );
}
