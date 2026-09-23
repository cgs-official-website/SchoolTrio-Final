import React, { useState, useEffect } from 'react';
import { LuPalette, LuImagePlus, LuSave, LuRefreshCw, LuRotateCcw } from 'react-icons/lu';
import toast from 'react-hot-toast';
import {
  getPlatformBranding,
  updatePlatformBranding,
  resetPlatformBranding,
  DEFAULT_PLATFORM_BRANDING
} from '../../api/platformBranding';

export default function BrandingSettings() {
  const [settings, setSettings] = useState({
    platformName: DEFAULT_PLATFORM_BRANDING.platformName,
    primaryColor: DEFAULT_PLATFORM_BRANDING.primaryColor,
    logoUrl: DEFAULT_PLATFORM_BRANDING.logoUrl,
    faviconUrl: DEFAULT_PLATFORM_BRANDING.faviconUrl,
    loginBackgroundImage: DEFAULT_PLATFORM_BRANDING.loginBackgroundImage
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchBranding() {
      try {
        setLoading(true);
        const res = await getPlatformBranding();
        if (isMounted && res?.data) {
          setSettings({
            platformName: res.data.platformName || DEFAULT_PLATFORM_BRANDING.platformName,
            primaryColor: res.data.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor,
            logoUrl: res.data.logoUrl || DEFAULT_PLATFORM_BRANDING.logoUrl,
            faviconUrl: res.data.faviconUrl || DEFAULT_PLATFORM_BRANDING.faviconUrl,
            loginBackgroundImage:
              res.data.loginBackgroundImage || DEFAULT_PLATFORM_BRANDING.loginBackgroundImage
          });
        }
      } catch (err) {
        toast.error(err.message || 'Failed to load platform branding');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchBranding();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        platformName: settings.platformName?.trim(),
        primaryColor: settings.primaryColor?.trim(),
        logoUrl: settings.logoUrl?.trim(),
        faviconUrl: settings.faviconUrl?.trim(),
        loginBackgroundImage: settings.loginBackgroundImage?.trim()
      };

      const res = await updatePlatformBranding(payload);
      if (res?.data) {
        setSettings({
          platformName: res.data.platformName || DEFAULT_PLATFORM_BRANDING.platformName,
          primaryColor: res.data.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor,
          logoUrl: res.data.logoUrl || DEFAULT_PLATFORM_BRANDING.logoUrl,
          faviconUrl: res.data.faviconUrl || DEFAULT_PLATFORM_BRANDING.faviconUrl,
          loginBackgroundImage:
            res.data.loginBackgroundImage || DEFAULT_PLATFORM_BRANDING.loginBackgroundImage
        });
      }
      toast.success('Global branding settings saved successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to save branding settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset platform branding to default settings?')) {
      return;
    }
    setResetting(true);
    try {
      const res = await resetPlatformBranding();
      if (res?.data) {
        setSettings({
          platformName: res.data.platformName || DEFAULT_PLATFORM_BRANDING.platformName,
          primaryColor: res.data.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor,
          logoUrl: res.data.logoUrl || DEFAULT_PLATFORM_BRANDING.logoUrl,
          faviconUrl: res.data.faviconUrl || DEFAULT_PLATFORM_BRANDING.faviconUrl,
          loginBackgroundImage:
            res.data.loginBackgroundImage || DEFAULT_PLATFORM_BRANDING.loginBackgroundImage
        });
      } else {
        setSettings({ ...DEFAULT_PLATFORM_BRANDING });
      }
      toast.success('Platform branding reset to defaults successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to reset branding settings');
    } finally {
      setResetting(false);
    }
  };

  const promptForAssetUrl = (field, currentVal, label) => {
    const input = window.prompt(`Enter URL for ${label}:`, currentVal || '');
    if (input !== null && input.trim() !== '') {
      setSettings((prev) => ({ ...prev, [field]: input.trim() }));
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8 shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <LuPalette className="text-primary-600" /> White-Labeling & Branding
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure default colors, logos, and platform names for all tenants.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || resetting || loading}
            className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
            aria-label="Reset to Defaults"
          >
            {resetting ? <LuRefreshCw size={18} className="animate-spin" /> : <LuRotateCcw size={18} />}
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || resetting || loading}
            className="px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            aria-label="Save Settings"
          >
            {saving ? <LuRefreshCw size={18} className="animate-spin" /> : <LuSave size={18} />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500 dark:text-slate-400">
              <LuRefreshCw size={32} className="animate-spin text-primary-600" />
              <p className="text-sm font-medium">Loading platform branding...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="max-w-3xl space-y-10">
              {/* Identity */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-2">
                  Platform Identity
                </h2>
                <div className="space-y-6">
                  <div>
                    <label htmlFor="platformName" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Platform Name
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      This is the default text shown if a school hasn't uploaded their own logo.
                    </p>
                    <input
                      id="platformName"
                      type="text"
                      aria-label="Platform Name"
                      value={settings.platformName}
                      onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                      className="w-full max-w-md px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="primaryColor" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Global Primary Color
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      Used for buttons, links, and highlights across the entire platform.
                    </p>
                    <div className="flex items-center gap-4">
                      <input
                        id="primaryColorPicker"
                        type="color"
                        aria-label="Global Primary Color Picker"
                        value={settings.primaryColor}
                        onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                        className="w-14 h-14 rounded-xl cursor-pointer border-0 p-0"
                      />
                      <input
                        id="primaryColor"
                        type="text"
                        aria-label="Global Primary Color"
                        value={settings.primaryColor}
                        onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                        className="w-32 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 font-mono uppercase text-sm"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Assets */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-2">
                  Digital Assets
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label htmlFor="logoUrl" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                      Global Default Logo
                    </label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => promptForAssetUrl('logoUrl', settings.logoUrl, 'Global Default Logo')}
                      onKeyDown={(e) => e.key === 'Enter' && promptForAssetUrl('logoUrl', settings.logoUrl, 'Global Default Logo')}
                      className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex flex-col items-center justify-center hover:border-primary-400 dark:hover:border-slate-700 hover:bg-primary-50 dark:hover:bg-slate-800 transition-colors cursor-pointer relative overflow-hidden group"
                    >
                      <img src={settings.logoUrl} alt="Logo" className="w-24 h-24 object-contain mb-2" />
                      <div className="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <LuImagePlus className="text-white mb-2" size={32} />
                        <span className="text-white font-bold text-sm">Change Logo</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <input
                        id="logoUrl"
                        type="text"
                        aria-label="Logo URL"
                        placeholder="https://example.com/logo.png or /logo.png"
                        value={settings.logoUrl}
                        onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Recommended: Transparent PNG or SVG asset URL.</p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="faviconUrl" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                      Favicon
                    </label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => promptForAssetUrl('faviconUrl', settings.faviconUrl, 'Favicon')}
                      onKeyDown={(e) => e.key === 'Enter' && promptForAssetUrl('faviconUrl', settings.faviconUrl, 'Favicon')}
                      className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex flex-col items-center justify-center hover:border-primary-400 dark:hover:border-slate-700 hover:bg-primary-50 dark:hover:bg-slate-800 transition-colors cursor-pointer relative overflow-hidden group"
                    >
                      <img src={settings.faviconUrl} alt="Favicon" className="w-16 h-16 object-contain mb-2" />
                      <div className="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <LuImagePlus className="text-white mb-2" size={32} />
                        <span className="text-white font-bold text-sm">Change Favicon</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <input
                        id="faviconUrl"
                        type="text"
                        aria-label="Favicon URL"
                        placeholder="https://example.com/favicon.ico or /logo.png"
                        value={settings.faviconUrl}
                        onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Recommended: 32x32px or 64x64px ICO or PNG icon URL.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Login Screen */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-2">
                  Login Portal Design
                </h2>
                <div>
                  <label htmlFor="loginBackgroundImage" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    Background Image
                  </label>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => promptForAssetUrl('loginBackgroundImage', settings.loginBackgroundImage, 'Login Background Image')}
                    onKeyDown={(e) => e.key === 'Enter' && promptForAssetUrl('loginBackgroundImage', settings.loginBackgroundImage, 'Login Background Image')}
                    className="w-full h-48 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex flex-col items-center justify-center hover:border-primary-400 dark:hover:border-slate-700 transition-colors cursor-pointer relative overflow-hidden group"
                  >
                    <img
                      src={settings.loginBackgroundImage}
                      alt="Login Background"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <LuImagePlus className="text-white mb-2" size={32} />
                      <span className="text-white font-bold text-sm">Upload New Image</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <input
                      id="loginBackgroundImage"
                      type="text"
                      aria-label="Login Background Image URL"
                      placeholder="https://images.unsplash.com/photo-..."
                      value={settings.loginBackgroundImage}
                      onChange={(e) => setSettings({ ...settings, loginBackgroundImage: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Recommended size: 1920x1080px. High-resolution CDN or web image URL.
                    </p>
                  </div>
                </div>
              </section>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
