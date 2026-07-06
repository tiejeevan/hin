import { useState, useEffect, useRef } from 'react';
import { User as UserType } from '@hin/types';
import { API_URL } from '../config';

interface UseMentionAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  token: string | null;
}

export function useMentionAutocomplete({ value, onChange, token }: UseMentionAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<UserType[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (!token || searchQuery.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowDropdown(data.length > 0);
          setActiveIndex(0);
        }
      } catch (e) {
        console.error('Error fetching mention suggestions:', e);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, token]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const text = e.target.value;
    const caretPos = e.target.selectionStart || 0;
    
    // Find if there is an active '@' trigger before the caret
    const textBeforeCaret = text.slice(0, caretPos);
    const lastAtIdx = textBeforeCaret.lastIndexOf('@');

    if (lastAtIdx !== -1) {
      // Check if there is whitespace before '@' or it is at the start
      const charBeforeAt = lastAtIdx > 0 ? textBeforeCaret[lastAtIdx - 1] : '';
      const isWordStart = charBeforeAt === '' || /\s/.test(charBeforeAt);

      if (isWordStart) {
        const query = textBeforeCaret.slice(lastAtIdx + 1);
        // Query must only contain alphanumeric or underscore characters and no spaces
        if (/^[a-zA-Z0-9_]*$/.test(query)) {
          setTriggerIndex(lastAtIdx);
          setSearchQuery(query);
          // Only show/fetch if query length is >= 2
          if (query.length < 2) {
            setShowDropdown(false);
          }
          return;
        }
      }
    }

    // Reset if no active trigger
    setTriggerIndex(-1);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const selectSuggestion = (username: string) => {
    if (triggerIndex === -1 || !inputRef.current) return;
    
    const caretPos = inputRef.current.selectionStart || 0;
    const beforeMention = value.slice(0, triggerIndex);
    const afterMention = value.slice(caretPos);
    
    const newValue = `${beforeMention}@${username} ${afterMention}`;
    onChange(newValue);
    
    const newCaretPos = triggerIndex + username.length + 2; // +2 for '@' and trailing space

    // Focus input and set selection position in next tick
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCaretPos, newCaretPos);
      }
    }, 0);

    // Reset states
    setTriggerIndex(-1);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex].username);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
    }
  };

  return {
    suggestions,
    showDropdown,
    activeIndex,
    inputRef,
    handleInputChange,
    handleKeyDown,
    selectSuggestion,
    setShowDropdown,
  };
}
