import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getReportCardTemplate, saveReportCardTemplate, uploadWordTemplate } from '../../api/reportCardTemplates';
import { LuSave, LuPalette, LuLayoutTemplate, LuType, LuEye, LuArrowLeft, LuSettings, LuCircleCheck, LuFileUp, LuSparkles } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function ReportTemplateBuilder({ onBack }) {
  const { userProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzingDoc, setAnalyzingDoc] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState('pdf'); // 'pdf' | 'original'
  const [uploadedDocHtml, setUploadedDocHtml] = useState(null);
  const [uploadedDocName, setUploadedDocName] = useState(null);
  const fileInputRef = useRef(null);

  // Template State
  const [template, setTemplate] = useState({
    themeColor: '#c99bc1', // primary by default
    header: {
      schoolName: '',
      showLogo: true,
      showAddress: true,
      showPhone: true,
      showEmail: true,
      title: 'PROGRESS REPORT',
      subtitle: 'Academic Session 2024-2025'
    },
    studentFields: {
      admissionNo: true,
      dob: true,
      fatherName: true,
      motherName: true,
      attendance: true
    },
    grading: {
      style: 'marks_and_grades', // 'marks', 'grades', 'marks_and_grades'
      showTotal: true,
      showPercentage: true,
      showRank: false,
    },
    footer: {
      signatures: ['Class Teacher', 'Principal', 'Parent'],
      gradingScaleText: 'A1: 91-100 | A2: 81-90 | B1: 71-80 | B2: 61-70 | C1: 51-60 | C2: 41-50 | D: 33-40 | E: Below 33',
      remarks: true
    }
  });

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    try {
      const res = await getReportCardTemplate('report_card');
      const configData = res?.data?.config || res?.data;
      if (configData) {
        setTemplate(prev => ({
          ...prev,
          ...configData,
          header: { ...prev.header, ...(configData.header || {}) },
          studentFields: { ...prev.studentFields, ...(configData.studentFields || {}) },
          grading: { ...prev.grading, ...(configData.grading || {}) },
          footer: { ...prev.footer, ...(configData.footer || {}) }
        }));
        if (configData.rawHtmlTemplate) {
          setUploadedDocHtml(configData.rawHtmlTemplate);
          setUploadedDocName(configData.originalDocxName || 'Uploaded Document');
          setActivePreviewTab('original');
        }
      }
    } catch (error) {
      console.error("Error loading template", error);
      toast.error(error.message || "Failed to load existing template");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast.error('Please upload a Microsoft Word (.docx) document');
      return;
    }

    setAnalyzingDoc(true);
    const toastId = toast.loading('AI is analyzing your Word document layout...');

    try {
      const res = await uploadWordTemplate(file);
      const extractedConfig = res?.data?.config;
      const htmlPreview = res?.data?.htmlPreview;
      const fileName = res?.data?.fileName || file.name;

      if (extractedConfig) {
        setTemplate(prev => ({
          ...prev,
          ...extractedConfig,
          rawHtmlTemplate: htmlPreview || prev.rawHtmlTemplate || null,
          originalDocxName: fileName || prev.originalDocxName || null,
          header: { ...prev.header, ...(extractedConfig.header || {}) },
          studentFields: { ...prev.studentFields, ...(extractedConfig.studentFields || {}) },
          grading: { ...prev.grading, ...(extractedConfig.grading || {}) },
          footer: { ...prev.footer, ...(extractedConfig.footer || {}) }
        }));

        if (htmlPreview) {
          setUploadedDocHtml(htmlPreview);
          setUploadedDocName(fileName);
        }
        // Auto-switch to Live PDF Preview so the uploaded document is immediately applied and visible
        setActivePreviewTab('pdf');

        toast.success('Word template analyzed and applied to Live PDF Preview! Click "Publish Template" to save.', { id: toastId });
      } else {
        toast.error('Could not extract configuration from file', { id: toastId });
      }
    } catch (error) {
      console.error('Error analyzing Word template:', error);
      toast.error(error.message || 'Failed to analyze Word document', { id: toastId });
    } finally {
      setAnalyzingDoc(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveReportCardTemplate('report_card', template);
      toast.success("Report Card Template saved successfully!");
    } catch (error) {
      console.error("Error saving template", error);
      toast.error(error.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const updateHeader = (field, value) => setTemplate({...template, header: {...template.header, [field]: value}});
  const updateStudentFields = (field, value) => setTemplate({...template, studentFields: {...template.studentFields, [field]: value}});
  const updateGrading = (field, value) => setTemplate({...template, grading: {...template.grading, [field]: value}});
  const updateFooter = (field, value) => setTemplate({...template, footer: {...template.footer, [field]: value}});

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <LuArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Template Builder</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Design your school's official report card</p>
          </div>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving || analyzingDoc}
          className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <LuSave size={18} />}
          {saving ? 'Saving...' : 'Publish Template'}
        </button>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: Controls Panel */}
        <div className="w-1/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <LuSettings className="text-primary-600" /> Configuration
            </h2>
          </div>
          
          <div className="p-6 space-y-8">
            
            {/* AI Word Document Upload Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/80 dark:border-indigo-800/50">
              <div className="flex items-center gap-2 mb-2">
                <LuSparkles className="text-indigo-600 dark:text-indigo-400" size={18} />
                <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">Import Word (.docx)</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                Upload your school's report card in Word format. OpenRouter AI will automatically extract and apply the layout.
              </p>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <button
                type="button"
                disabled={analyzingDoc}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {analyzingDoc ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Analyzing with OpenRouter AI...</span>
                  </>
                ) : (
                  <>
                    <LuFileUp size={16} />
                    <span>Upload Word Document (.docx)</span>
                  </>
                )}
              </button>
            </div>

            {/* Global Settings */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <LuPalette /> Global Theme
              </h3>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={template.themeColor} 
                  onChange={(e) => setTemplate({...template, themeColor: e.target.value})}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Primary Color ({template.themeColor})</span>
              </div>
            </div>

            {/* Header Configuration */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <LuLayoutTemplate /> Header Settings
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block mb-1">School Name</label>
                  <input 
                    type="text" 
                    value={template.header.schoolName || ''} 
                    placeholder={userProfile?.schoolName || 'YOUR SCHOOL NAME'}
                    onChange={e => updateHeader('schoolName', e.target.value)} 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary-500" 
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block mb-1">Report Title</label>
                  <input type="text" value={template.header.title} onChange={e => updateHeader('title', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block mb-1">Subtitle / Session</label>
                  <input type="text" value={template.header.subtitle} onChange={e => updateHeader('subtitle', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="pt-2 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.header.showLogo} onChange={e => updateHeader('showLogo', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    School Logo
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.header.showAddress} onChange={e => updateHeader('showAddress', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    Address
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.header.showPhone} onChange={e => updateHeader('showPhone', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    Phone No.
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.header.showEmail} onChange={e => updateHeader('showEmail', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    Email
                  </label>
                </div>
              </div>
            </div>

            {/* Student Fields */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <LuType /> Student Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(template.studentFields).map(key => (
                  <label key={key} className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.studentFields[key]} onChange={e => updateStudentFields(key, e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </label>
                ))}
              </div>
            </div>

            {/* Grading Display */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <LuCircleCheck /> Academic Display
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block mb-2">Grading Style</label>
                  <select value={template.grading.style} onChange={e => updateGrading('style', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary-500">
                    <option value="marks">Marks Only</option>
                    <option value="grades">Grades Only</option>
                    <option value="marks_and_grades">Marks & Grades</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.grading.showTotal} onChange={e => updateGrading('showTotal', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    Show Total
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={template.grading.showPercentage} onChange={e => updateGrading('showPercentage', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                    Show Percentage
                  </label>
                </div>
              </div>
            </div>

            {/* Dynamic Columns Configuration */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <LuLayoutTemplate /> Extracted Table Columns
              </h3>
              <p className="text-xs text-slate-500 mb-3">Columns extracted from your Word document. You can edit them live:</p>
              <div className="space-y-2">
                {(template.grading?.columns || ['Subject', 'Max Marks', 'Marks Obtained', 'Grade']).map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-5 text-right">{idx + 1}.</span>
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => {
                        const newCols = [...(template.grading?.columns || ['Subject', 'Max Marks', 'Marks Obtained', 'Grade'])];
                        newCols[idx] = e.target.value;
                        setTemplate({
                          ...template,
                          grading: { ...template.grading, columns: newCols }
                        });
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer & Signatures */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <LuLayoutTemplate /> Footer & Signatures
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-2">Signature Labels (Left to Right)</label>
                  <div className="space-y-2">
                    {(template.footer?.signatures || ['Class Teacher', 'Principal', 'Parent']).map((sig, sIdx) => (
                      <div key={sIdx} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 w-5 text-right">{sIdx + 1}.</span>
                        <input
                          type="text"
                          value={sig}
                          onChange={(e) => {
                            const newSigs = [...(template.footer?.signatures || ['Class Teacher', 'Principal', 'Parent'])];
                            newSigs[sIdx] = e.target.value;
                            updateFooter('signatures', newSigs);
                          }}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block mb-1">Grading Scale Text (Optional)</label>
                  <textarea 
                    value={template.footer.gradingScaleText} 
                    onChange={e => updateFooter('gradingScaleText', e.target.value)} 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary-500 h-20"
                    placeholder="E.g., A1: 91-100 | A2: 81-90..."
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={template.footer.remarks} onChange={e => updateFooter('remarks', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4" />
                  Show Teacher Remarks Area
                </label>
              </div>
            </div>

          </div>
        </div>

        {/* Right: Live Preview Pane */}
        <div className="w-2/3 bg-slate-200/50 rounded-3xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          <div className="p-3 px-4 bg-slate-800 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePreviewTab('pdf')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activePreviewTab === 'pdf'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <LuEye size={14} /> Live PDF Preview
              </button>
              {uploadedDocHtml && (
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('original')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activePreviewTab === 'original'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <LuSparkles size={14} /> Uploaded Document ({uploadedDocName || 'Word'})
                </button>
              )}
            </div>
            <span className="text-xs font-medium text-slate-400 dark:text-slate-300 bg-slate-700 px-2 py-1 rounded">
              {activePreviewTab === 'pdf' ? 'A4 Portrait' : 'Document View'}
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 flex justify-center custom-scrollbar">
            {activePreviewTab === 'original' && uploadedDocHtml ? (
              <div className="bg-white dark:bg-slate-900 shadow-2xl w-full max-w-[794px] min-h-[1123px] p-10 font-sans text-slate-900 dark:text-white rounded-lg overflow-x-auto">
                <div className="mb-4 pb-2 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Uploaded Document Preview: {uploadedDocName}
                  </span>
                  <span className="text-xs text-slate-400">Rendered from .docx structure</span>
                </div>
                <div 
                  className="prose dark:prose-invert max-w-none [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_p]:mb-2"
                  dangerouslySetInnerHTML={{ __html: uploadedDocHtml }} 
                />
              </div>
            ) : (
            /* The A4 Paper representation */
            <div className="bg-white dark:bg-slate-900 shadow-2xl w-full max-w-[794px] min-h-[1123px] flex flex-col" style={{ fontFamily: "'Times New Roman', serif" }}>
              
              {/* Report Card Header */}
              <div className="p-8 pb-4 flex items-center border-b-[3px]" style={{ borderColor: template.themeColor }}>
                {template.header.showLogo && (
                  <div className="w-24 h-24 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center border-2 shrink-0" style={{ borderColor: template.themeColor }}>
                    <span className="text-xs text-slate-400 dark:text-slate-300 font-sans font-bold">LOGO</span>
                  </div>
                )}
                <div className={`flex-1 ${template.header.showLogo ? 'text-center' : 'text-left'}`}>
                  <h1 className="text-3xl font-black uppercase text-slate-900 dark:text-white" style={{ color: template.themeColor }}>
                    {template.header.schoolName || userProfile?.schoolName || 'YOUR SCHOOL NAME'}
                  </h1>
                  
                  <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">
                    {template.header.showAddress && <span>123 Education Street, Learning City, 10001<br/></span>}
                    <span className="font-medium">
                      {template.header.showPhone && <span>Tel: +1 234 567 8900 </span>}
                      {template.header.showPhone && template.header.showEmail && <span> | </span>}
                      {template.header.showEmail && <span>Email: info@yourschool.edu</span>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Title Section */}
              <div className="py-6 text-center">
                <h2 className="text-2xl font-bold uppercase underline decoration-2 underline-offset-4" style={{ decorationColor: template.themeColor }}>
                  {template.header.title}
                </h2>
                <p className="text-md font-semibold text-slate-600 dark:text-slate-300 mt-2">{template.header.subtitle}</p>
              </div>

              {/* Student Details Grid */}
              <div className="px-10 pb-8">
                <div className="grid grid-cols-2 gap-x-12 gap-y-3 p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 font-sans">
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Student Name:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">John Doe</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Class & Section:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">10 - A</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Roll No:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">42</span>
                  </div>

                  {template.studentFields.admissionNo && (
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Admission No:</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">SCH/2020/012</span>
                    </div>
                  )}
                  {template.studentFields.dob && (
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Date of Birth:</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">15-Aug-2010</span>
                    </div>
                  )}
                  {template.studentFields.fatherName && (
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Father's Name:</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">Richard Doe</span>
                    </div>
                  )}
                  {template.studentFields.motherName && (
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Mother's Name:</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">Jane Doe</span>
                    </div>
                  )}
                  {template.studentFields.attendance && (
                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Attendance:</span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">185 / 200</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Marks Table */}
              <div className="px-10 flex-1">
                <table className="w-full border-collapse font-sans text-sm">
                  <thead>
                    <tr className="text-white" style={{ backgroundColor: template.themeColor }}>
                      {(template.grading?.columns && template.grading.columns.length > 0) ? (
                        template.grading.columns.map((col, idx) => (
                          <th key={idx} className={`border border-slate-400 p-2 ${idx === 0 ? 'text-left w-1/2' : 'text-center'}`}>
                            {col}
                          </th>
                        ))
                      ) : (
                        <>
                          <th className="border border-slate-400 p-2 text-left w-1/2">Scholastic Area : Subjects</th>
                          <th className="border border-slate-400 p-2 text-center w-24">Max Marks</th>
                          {['marks', 'marks_and_grades'].includes(template.grading.style) && <th className="border border-slate-400 p-2 text-center">Marks Obt.</th>}
                          {['grades', 'marks_and_grades'].includes(template.grading.style) && <th className="border border-slate-400 p-2 text-center">Grade</th>}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {['English', 'Mathematics', 'Science', 'Social Studies', 'Computer Science'].map((sub, i) => {
                      const cols = template.grading?.columns && template.grading.columns.length > 0
                        ? template.grading.columns
                        : ['Subject', 'Max Marks', 'Marks Obt.', 'Grade'];

                      return (
                        <tr key={sub} className={i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800'}>
                          {cols.map((colName, cIdx) => {
                            if (cIdx === 0) {
                              return <td key={cIdx} className="border border-slate-400 p-2 font-medium">{sub}</td>;
                            }
                            const lower = colName.toLowerCase();
                            if (lower.includes('max')) {
                              return <td key={cIdx} className="border border-slate-400 p-2 text-center">100</td>;
                            }
                            if (lower.includes('grade')) {
                              return <td key={cIdx} className="border border-slate-400 p-2 text-center font-bold text-slate-800 dark:text-slate-100">{i % 2 === 0 ? 'A1' : 'A2'}</td>;
                            }
                            // Default to sample mark score (e.g. for PT/20, T/50, Total, etc.)
                            const sampleScore = lower.includes('/20') ? (16 + (i % 4))
                              : lower.includes('/50') ? (42 + (i % 6))
                              : lower.includes('/10') ? (8 + (i % 2))
                              : (85 + i);
                            return (
                              <td key={cIdx} className="border border-slate-400 p-2 text-center font-bold text-slate-800 dark:text-slate-100">
                                {sampleScore}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {/* Totals */}
                    {(template.grading.showTotal || template.grading.showPercentage) && (
                      <tr className="bg-slate-100 dark:bg-slate-700 font-bold">
                        {(template.grading?.columns && template.grading.columns.length > 0
                          ? template.grading.columns
                          : ['Subject', 'Max Marks', 'Marks Obt.', 'Grade']
                        ).map((colName, cIdx) => {
                          if (cIdx === 0) {
                            return <td key={cIdx} className="border border-slate-400 p-2 text-right">TOTAL</td>;
                          }
                          const lower = colName.toLowerCase();
                          if (lower.includes('grade')) {
                            return <td key={cIdx} className="border border-slate-400 p-2 text-center text-primary-700" style={{ color: template.themeColor }}>A1</td>;
                          }
                          if (lower.includes('max')) {
                            return <td key={cIdx} className="border border-slate-400 p-2 text-center">500</td>;
                          }
                          return (
                            <td key={cIdx} className="border border-slate-400 p-2 text-center text-primary-700" style={{ color: template.themeColor }}>
                              {lower.includes('/20') ? '85' : lower.includes('/50') ? '215' : '435'}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
                
                {template.grading.showPercentage && (
                  <div className="mt-4 text-right font-sans font-bold text-lg">
                    Percentage: <span style={{ color: template.themeColor }}>87.0%</span>
                  </div>
                )}
              </div>

              {/* Remarks Area */}
              {template.footer.remarks && (
                <div className="px-10 mt-8">
                  <div className="border-2 border-slate-300 dark:border-slate-600 p-4 rounded-xl min-h-[80px]">
                    <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block mb-1">Class Teacher's Remarks:</span>
                    <span className="text-sm font-medium italic text-slate-500 dark:text-slate-400">John has shown excellent progress in mathematics. Keep up the good work!</span>
                  </div>
                </div>
              )}

              {/* Footer Section */}
              <div className="px-10 pt-16 pb-8 mt-auto flex flex-col font-sans">
                
                {/* Signatures */}
                <div className="flex justify-between w-full mb-8">
                  {template.footer.signatures.map((sig, index) => (
                    <div key={index} className="flex flex-col items-center">
                      <div className="w-32 border-b-2 border-slate-900 mb-2"></div>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">{sig}</span>
                    </div>
                  ))}
                </div>

                {/* Grading Scale */}
                {template.footer.gradingScaleText && (
                  <div className="border-t border-slate-300 dark:border-slate-600 pt-4 text-center">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Grading Scale</span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {template.footer.gradingScaleText}
                    </p>
                  </div>
                )}

              </div>

            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

