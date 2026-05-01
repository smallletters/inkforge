/**
 * 灵砚 InkForge - 样式化多选下拉组件
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-01
 *
 * 功能描述：美化的多选下拉菜单，支持主题色、Portal渲染、智能定位
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

interface StyledMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  accentColor?: string;
}

export default function StyledMultiSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  accentColor = 'var(--accent)',
}: StyledMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // 检查点击是否在下拉菜单内或触发器内
      const menuElement = document.querySelector('.styled-multiselect-menu');
      const triggerElement = dropdownRef.current;
      const clickedInsideMenu = menuElement && menuElement.contains(e.target as Node);
      const clickedInsideTrigger = triggerElement && triggerElement.contains(e.target as Node);
      
      if (!clickedInsideMenu && !clickedInsideTrigger) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('click', handleClick);
    }
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const menuHeight = Math.min(options.length * 44 + 20, 260);
      const showAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      setMenuPos({
        top: showAbove ? rect.top + window.scrollY - menuHeight - 8 : rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 220),
      });
    }
    setIsOpen(!isOpen);
  };

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const dropdown = isOpen && createPortal(
    <div
      className="styled-multiselect-menu"
      style={{
        position: 'absolute',
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        minWidth: '220px',
        background: 'rgba(24, 24, 27, 0.98)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '6px',
        zIndex: 99999,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        maxHeight: '260px',
        overflowY: 'auto',
      }}
    >
      {options.map((option) => {
        const isSelected = value.includes(option.value);
        const optionColor = option.color || accentColor;
        
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleOption(option.value)}
            className="w-full flex items-center gap-3"
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: isSelected ? `2px solid ${optionColor}` : '2px solid transparent',
              background: isSelected ? `linear-gradient(135deg, ${optionColor}15 0%, ${optionColor}05 100%)` : 'transparent',
              color: isSelected ? optionColor : 'var(--text-secondary)',
              fontWeight: isSelected ? '500' : '400',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '2px',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = `${optionColor}10`;
                e.currentTarget.style.color = optionColor;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            <span style={{
              width: '14px',
              height: '14px',
              borderRadius: '4px',
              border: `2px solid ${isSelected ? optionColor : 'rgba(255,255,255,0.3)'}`,
              background: isSelected ? optionColor : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {isSelected && (
                <i className="fa-solid fa-check" style={{ fontSize: '10px', color: '#000' }}></i>
              )}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>,
    document.body
  );

  const displayLabel = value.length > 0
    ? `${options.find((o) => o.value === value[0])?.label}${value.length > 1 ? ` +${value.length - 1}` : ''}`
    : placeholder;

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between"
        style={{
          padding: '10px 14px',
          background: isOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
          border: `2px solid ${isOpen ? accentColor : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '10px',
          color: value.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
          fontWeight: '500',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isOpen ? `0 0 0 3px ${accentColor}20` : 'none',
          minWidth: '200px',
          textAlign: 'left',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {displayLabel}
        </span>
        <i
          className={`fa-solid fa-chevron-down transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ fontSize: '12px', color: accentColor, marginLeft: '8px' }}
        ></i>
      </button>
      {mounted && dropdown}
    </div>
  );
}
