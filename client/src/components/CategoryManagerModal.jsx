import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Tag, Plus, Trash2, Edit2, Archive, RotateCcw, X, Check,
  AlertCircle, AlertTriangle, ArrowRight, RefreshCw, Sparkles,
  Utensils, ShoppingBasket, Car, Home, Lightbulb, ShoppingBag,
  HeartPulse, Film, BookOpen, Plane, CreditCard, Gift, Repeat,
  MoreHorizontal, PawPrint, ShieldCheck, TrendingUp, Wrench,
  Receipt, Users, Briefcase, Coffee, Smartphone, Shield, Zap
} from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import CustomDropdown from './CustomDropdown';
import * as api from '../services/api';
import { SUGGESTED_OPTIONAL_CATEGORIES } from '../services/firestoreService';

export default function CategoryManagerModal({
  isOpen,
  onClose,
  categories = [],
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onArchiveCategory,
  onRestoreCategory,
  onReassignCategory,
  initialTab = 'active',
  initialAdd = false
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'active'); // 'active' | 'archived'
  const [searchQuery, setSearchQuery] = useState('');

  // Editing Category state
  const [editingCategory, setEditingCategory] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Tag');
  const [editColor, setEditColor] = useState('#6C47FF');
  const [editIsQuick, setEditIsQuick] = useState(false);
  const [editError, setEditError] = useState('');

  // New Category state
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Tag');
  const [newColor, setNewColor] = useState('#6C47FF');
  const [newIsQuick, setNewIsQuick] = useState(false);
  const [newError, setNewError] = useState('');
  const [isAdding, setIsAdding] = useState(Boolean(initialAdd));

  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      if (initialAdd !== undefined) setIsAdding(Boolean(initialAdd));
    }
  }, [isOpen, initialTab, initialAdd]);

  // Removing Category / Smart Confirmation state
  const [removingCategory, setRemovingCategory] = useState(null);
  const [checkingTxCount, setCheckingTxCount] = useState(false);
  const [txCount, setTxCount] = useState(0);
  const [reassignTarget, setReassignTarget] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Supported Icon Palette
  const iconList = [
    { name: 'Utensils', label: 'Food' },
    { name: 'ShoppingBasket', label: 'Groceries' },
    { name: 'Car', label: 'Transport' },
    { name: 'Home', label: 'Housing' },
    { name: 'Lightbulb', label: 'Utilities' },
    { name: 'ShoppingBag', label: 'Shopping' },
    { name: 'HeartPulse', label: 'Medical' },
    { name: 'Sparkles', label: 'Personal' },
    { name: 'Film', label: 'Entertainment' },
    { name: 'BookOpen', label: 'Education' },
    { name: 'Plane', label: 'Travel' },
    { name: 'CreditCard', label: 'EMI' },
    { name: 'Gift', label: 'Gifts' },
    { name: 'Repeat', label: 'Subscriptions' },
    { name: 'MoreHorizontal', label: 'Other' },
    { name: 'PawPrint', label: 'Pet Care' },
    { name: 'ShieldCheck', label: 'Insurance' },
    { name: 'TrendingUp', label: 'Investments' },
    { name: 'Wrench', label: 'Maintenance' },
    { name: 'Receipt', label: 'Fees' },
    { name: 'Users', label: 'Family' },
    { name: 'Briefcase', label: 'Business' },
    { name: 'Coffee', label: 'Cafe' },
    { name: 'Smartphone', label: 'Recharge' }
  ];

  const colorOptions = [
    '#6C47FF', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#6366F1',
    '#EF4444', '#8B5CF6', '#0EA5E9', '#F97316', '#F43F5E', '#64748B'
  ];

  // Active vs Archived Categories
  const activeCategories = useMemo(() => {
    return categories.filter(c => !c.archived);
  }, [categories]);

  const archivedCategories = useMemo(() => {
    return categories.filter(c => Boolean(c.archived));
  }, [categories]);

  // Standard vs Custom Active
  const standardCategories = useMemo(() => {
    return activeCategories.filter(c => Boolean(c.is_system));
  }, [activeCategories]);

  const customCategories = useMemo(() => {
    return activeCategories.filter(c => !c.is_system);
  }, [activeCategories]);

  // Suggested Optional Categories that are not yet added
  const unaddedSuggestions = useMemo(() => {
    const existingNames = new Set(categories.map(c => (c.name || '').toLowerCase().trim()));
    return (SUGGESTED_OPTIONAL_CATEGORIES || []).filter(
      s => !existingNames.has((s.name || '').toLowerCase().trim())
    );
  }, [categories]);

  // Search filter
  const filterList = (list) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(c => (c.name || '').toLowerCase().includes(q));
  };

  // Start Editing
  const handleOpenEdit = (cat) => {
    setEditingCategory(cat);
    setEditName(cat.name || '');
    setEditIcon(cat.icon || 'Tag');
    setEditColor(cat.color || '#6C47FF');
    setEditIsQuick(Boolean(cat.is_quick));
    setEditError('');
  };

  // Save Edit
  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Category name cannot be empty');
      return;
    }

    // Check duplicate name
    const isDuplicate = activeCategories.some(
      c => c.id !== editingCategory.id && (c.name || '').toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setEditError(`A category named "${trimmed}" already exists`);
      return;
    }

    try {
      setActionLoading(true);
      if (onUpdateCategory) {
        await onUpdateCategory(editingCategory.id, {
          name: trimmed,
          icon: editIcon,
          color: editColor,
          is_quick: editIsQuick
        });
      }
      setEditingCategory(null);
    } catch (err) {
      setEditError(err.message || 'Failed to update category');
    } finally {
      setActionLoading(false);
    }
  };

  // Start Adding
  const handleCreateNew = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setNewError('Category name cannot be empty');
      return;
    }

    const isDuplicate = activeCategories.some(
      c => (c.name || '').toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setNewError(`A category named "${trimmed}" already exists`);
      return;
    }

    try {
      setActionLoading(true);
      if (onAddCategory) {
        await onAddCategory({
          name: trimmed,
          icon: newIcon,
          color: newColor,
          is_quick: newIsQuick,
          is_system: false
        });
      }
      setNewName('');
      setNewError('');
      setIsAdding(false);
    } catch (err) {
      setNewError(err.message || 'Failed to create category');
    } finally {
      setActionLoading(false);
    }
  };

  // Add 1-click suggested optional category
  const handleAddSuggestion = async (sug) => {
    try {
      setActionLoading(true);
      if (onAddCategory) {
        await onAddCategory({
          name: sug.name,
          icon: sug.icon,
          color: sug.color,
          is_quick: false,
          is_system: false
        });
      }
    } catch (err) {
      console.warn('Failed to add suggested category:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Start Removal check
  const handleOpenRemove = async (cat) => {
    setRemovingCategory(cat);
    setCheckingTxCount(true);
    setTxCount(0);
    // Find a default reassign target other than this category
    const otherCat = activeCategories.find(c => c.id !== cat.id);
    setReassignTarget(otherCat ? otherCat.name : 'Other');

    try {
      const count = await api.countCategoryTransactions(cat.name);
      setTxCount(count);
    } catch (err) {
      console.warn('Could not count category transactions:', err);
    } finally {
      setCheckingTxCount(false);
    }
  };

  // Safe Direct Delete (when count === 0)
  const handleConfirmDirectDelete = async () => {
    if (!removingCategory) return;
    try {
      setActionLoading(true);
      if (onDeleteCategory) {
        await onDeleteCategory(removingCategory.id);
      }
      setRemovingCategory(null);
    } catch (err) {
      console.error('Delete category error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Reassign & Remove
  const handleConfirmReassign = async () => {
    if (!removingCategory || !reassignTarget) return;
    try {
      setActionLoading(true);
      if (onReassignCategory) {
        await onReassignCategory(removingCategory.name, reassignTarget, removingCategory.id);
      } else if (onDeleteCategory) {
        await onDeleteCategory(removingCategory.id);
      }
      setRemovingCategory(null);
    } catch (err) {
      console.error('Reassign category error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Archive Category (when count > 0 or user preference)
  const handleConfirmArchive = async () => {
    if (!removingCategory) return;
    try {
      setActionLoading(true);
      if (onArchiveCategory) {
        await onArchiveCategory(removingCategory.id);
      }
      setRemovingCategory(null);
    } catch (err) {
      console.error('Archive category error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Restore Category
  const handleRestore = async (cat) => {
    try {
      setActionLoading(true);
      if (onRestoreCategory) {
        await onRestoreCategory(cat.id);
      }
    } catch (err) {
      console.error('Restore category error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 modal-safe-overlay bg-slate-900/60 backdrop-blur-sm animate-fade-in select-none" style={{ touchAction: 'none' }}>
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-[#18132F] rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-white/10 shadow-2xl z-10 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in" style={{ overscrollBehavior: 'contain' }}>

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-[#281D4C] text-[#6C47FF] dark:text-[#C084FC] flex items-center justify-center shadow-xs">
              <Tag size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  Expense Categories
                </h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-[#6C47FF] dark:text-[#C084FC]">
                  {activeCategories.length} Active Categories
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Customize, edit, reassign, or archive personal categories
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Tabs Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'active'
                ? 'bg-white dark:bg-[#281D4C] text-[#6C47FF] dark:text-[#C084FC] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              Active ({activeCategories.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'archived'
                ? 'bg-white dark:bg-[#281D4C] text-[#6C47FF] dark:text-[#C084FC] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <Archive size={13} />
              <span>Archived ({archivedCategories.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
            />

            {!isAdding && activeTab === 'active' && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="px-3.5 py-1.5 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold transition-all flex items-center gap-1 shadow-md shadow-purple-600/30 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Custom</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Category Content Area */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1 pt-2">

          {/* Inline Add Custom Category Form */}
          {isAdding && (
            <form onSubmit={handleCreateNew} className="p-4 rounded-2xl border border-dashed border-[#6C47FF] bg-purple-50/40 dark:bg-purple-950/20 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plus size={14} className="text-[#6C47FF] dark:text-[#C084FC]" />
                  <span>Create Custom Category</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setIsAdding(false); setNewError(''); }}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {newError && (
                <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                  <AlertCircle size={13} />
                  <span>{newError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Category Name (e.g. Gym, Pet Care, Subscriptions)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#18132F] text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                />
                <button
                  type="submit"
                  disabled={actionLoading || !newName.trim()}
                  className="px-5 py-2 bg-[#6C47FF] hover:bg-[#5835E5] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  {actionLoading && <RefreshCw size={12} className="animate-spin" />}
                  <span>Save Category</span>
                </button>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Icon:
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/5">
                  {iconList.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setNewIcon(item.name)}
                      title={item.label}
                      className={`p-2 rounded-lg transition-all cursor-pointer ${newIcon === item.name
                        ? 'bg-[#6C47FF] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                        }`}
                    >
                      <CategoryIcon icon={item.name} size={15} color={newIcon === item.name ? '#FFFFFF' : newColor} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Swatch Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">Color:</span>
                {colorOptions.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setNewColor(hex)}
                    className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${newColor === hex ? 'scale-125 ring-2 ring-white dark:ring-purple-400 shadow-md' : 'opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </form>
          )}

          {/* TAB 1: ACTIVE CATEGORIES */}
          {activeTab === 'active' && (
            <div className="space-y-6">

              {/* Suggested Optional Categories Pills */}
              {unaddedSuggestions.length > 0 && !searchQuery && (
                <div className="p-3.5 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-[#6C47FF] dark:text-[#C084FC]" />
                      <span>Suggested Categories (1-Click to Add)</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Optional</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {unaddedSuggestions.map((sug) => (
                      <button
                        key={sug.name}
                        type="button"
                        onClick={() => handleAddSuggestion(sug)}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-[#18132F] border border-purple-200/80 dark:border-purple-500/20 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#6C47FF] hover:text-[#6C47FF] dark:hover:text-[#C084FC] transition-all shadow-2xs cursor-pointer group"
                      >
                        <CategoryIcon icon={sug.icon} size={12} color={sug.color} />
                        <span>{sug.name}</span>
                        <span className="text-[10px] text-purple-500 font-bold group-hover:scale-125 transition-transform">+</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section A: Standard Categories */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                  <span>Standard Categories ({filterList(standardCategories).length})</span>
                  <span className="text-[11px] font-normal normal-case">Can be edited or safely removed</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filterList(standardCategories).map((cat) => (
                    <div
                      key={cat.id || cat.name}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 flex items-center justify-between hover:border-purple-500/30 transition-all group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-2xs"
                          style={{ backgroundColor: cat.color || '#6C47FF' }}
                        >
                          <CategoryIcon icon={cat.icon || 'Tag'} size={15} />
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                            {cat.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Standard
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(cat)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#6C47FF] hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title="Edit Category"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRemove(cat)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title="Remove Category"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section B: Custom Categories */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                  <span>Custom Categories ({filterList(customCategories).length})</span>
                  <span className="text-[11px] font-normal normal-case">Created by you</span>
                </div>

                {customCategories.length === 0 ? (
                  <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 text-center text-xs text-slate-400">
                    No custom categories yet. Tap &ldquo;Add Custom&rdquo; above to create one.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filterList(customCategories).map((cat) => (
                      <div
                        key={cat.id || cat.name}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 flex items-center justify-between hover:border-purple-500/30 transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-2xs"
                            style={{ backgroundColor: cat.color || '#6C47FF' }}
                          >
                            <CategoryIcon icon={cat.icon || 'Tag'} size={15} />
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                              {cat.name}
                            </span>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                              Custom
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#6C47FF] hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Edit Category"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRemove(cat)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Remove Category"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ARCHIVED CATEGORIES */}
          {activeTab === 'archived' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                Archived categories are hidden from expense creation, but their historical transactions and reports are 100% preserved. You can restore them anytime.
              </div>

              {archivedCategories.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 text-center text-xs text-slate-400">
                  No archived categories.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filterList(archivedCategories).map((cat) => (
                    <div
                      key={cat.id || cat.name}
                      className="p-3 rounded-2xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: cat.color || '#64748B' }}
                        >
                          <CategoryIcon icon={cat.icon || 'Tag'} size={15} />
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                            {cat.name}
                          </span>
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                            Archived
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestore(cat)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-[#6C47FF] text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-[#6C47FF] dark:hover:text-[#C084FC] transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw size={12} />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-slate-100 dark:border-white/10 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* ========================================================
          SUB-DIALOG 1: EDIT CATEGORY MODAL
         ======================================================== */}
      {editingCategory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setEditingCategory(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#18132F] rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-2xl z-10 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: editColor }}
                >
                  <CategoryIcon icon={editIcon} size={15} />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Edit Category: {editingCategory.name}
                </h3>
              </div>
              <button onClick={() => setEditingCategory(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X size={16} />
              </button>
            </div>

            {editError && (
              <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                <AlertCircle size={13} />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                />
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Category Icon
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/5">
                  {iconList.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setEditIcon(item.name)}
                      className={`p-2 rounded-lg transition-all cursor-pointer ${editIcon === item.name
                        ? 'bg-[#6C47FF] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                        }`}
                    >
                      <CategoryIcon icon={item.name} size={15} color={editIcon === item.name ? '#FFFFFF' : editColor} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Swatches */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {colorOptions.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setEditColor(hex)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${editColor === hex ? 'scale-125 ring-2 ring-white dark:ring-purple-400 shadow-md' : 'opacity-70 hover:opacity-100'}`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !editName.trim()}
                  className="px-5 py-2 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading && <RefreshCw size={13} className="animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-DIALOG 2: SMART REMOVAL & REASSIGN CONFIRMATION
         ======================================================== */}
      {removingCategory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setRemovingCategory(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#18132F] rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-2xl z-10 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-white/10">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Remove Category: {removingCategory.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Historical transaction protection guard
                </p>
              </div>
            </div>

            {checkingTxCount ? (
              <div className="py-6 text-center space-y-2">
                <RefreshCw size={20} className="animate-spin text-[#6C47FF] mx-auto" />
                <p className="text-xs text-slate-500">Checking historical transactions...</p>
              </div>
            ) : txCount === 0 ? (
              /* Case 1: 0 Transactions -> Safe Direct Removal */
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300">
                  No existing transactions found under &ldquo;{removingCategory.name}&rdquo;. You can safely remove it from your categories list.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRemovingCategory(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDirectDelete}
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading && <RefreshCw size={13} className="animate-spin" />}
                    <span>Remove Category</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Case 2: Has Existing Transactions -> Reassign or Archive Choices */
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="font-bold">
                    &ldquo;{removingCategory.name}&rdquo; has {txCount} recorded transactions.
                  </div>
                  <div>
                    To protect your financial accuracy, historical records will not be deleted. Please choose how to proceed:
                  </div>
                </div>

                {/* Choice A: Reassign Transactions */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-2.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ArrowRight size={14} className="text-[#6C47FF]" />
                    <span>Option 1: Reassign {txCount} Transactions</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <CustomDropdown
                        value={reassignTarget}
                        onChange={(val) => setReassignTarget(val)}
                        options={activeCategories
                          .filter(c => c.id !== removingCategory.id)
                          .map(c => ({
                            value: c.name,
                            label: `Reassign to: ${c.name}`,
                            color: c.color
                          }))}
                        placeholder="Choose category..."
                        ariaLabel="Reassign target category"
                        searchable={true}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmReassign}
                      disabled={actionLoading || !reassignTarget}
                      className="px-3.5 py-2.5 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 flex-shrink-0"
                    >
                      {actionLoading && <RefreshCw size={12} className="animate-spin" />}
                      <span>Reassign &amp; Delete</span>
                    </button>
                  </div>
                </div>

                {/* Choice B: Archive Category */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Archive size={14} className="text-purple-500" />
                    <span>Option 2: Archive Category (Recommended)</span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Hides &ldquo;{removingCategory.name}&rdquo; from expense creation dropdowns, while keeping all past reports and transactions 100% intact.
                  </p>

                  <button
                    type="button"
                    onClick={handleConfirmArchive}
                    disabled={actionLoading}
                    className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading && <RefreshCw size={12} className="animate-spin" />}
                    <span>Archive Category</span>
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setRemovingCategory(null)}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
