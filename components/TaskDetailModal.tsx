import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ProjectTask, SubStep, ActionItem, EditableExtendedTaskDetails, TaskStatus, SubStepStatus, Attachment, Decision, SlideDeck } from '../types';
import { XIcon, PlusIcon, TrashIcon, SubtaskIcon, NotesIcon, ResourcesIcon, ResponsibleIcon, PresentationChartBarIcon, SparklesIcon, ClipboardDocumentListIcon, LockClosedIcon, LockOpenIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, CheckSquareIcon, SquareIcon, PaperClipIcon, TableCellsIcon } from './icons';
import { generateStepProposals, generateInitialSlideDeck } from '../services/geminiService';
import ProposalReviewModal from './ProposalReviewModal';
import SlideEditorView from './SlideEditorView';
import ActionItemReportModal from './ActionItemReportModal';
import ActionItemTableModal from './ActionItemTableModal';
import CustomTaskReportModal from './CustomTaskReportModal';
import DecisionModal from './DecisionModal';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface TaskDetailModalProps {
  task: ProjectTask;
  onClose: () => void;
  onUpdateTaskCoreInfo: (taskId: string, updates: { title: string; description: string; status: TaskStatus }) => void;
  onUpdateExtendedDetails: (taskId: string, details: EditableExtendedTaskDetails) => void;
  generateUniqueId: (prefix: string) => string;
  projectGoal: string;
  targetDate: string;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ 
  task, 
  onClose, 
  onUpdateTaskCoreInfo, 
  onUpdateExtendedDetails, 
  generateUniqueId,
  projectGoal,
  targetDate
}) => {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState(task.status || TaskStatus.NOT_STARTED);
  const [extendedDetails, setExtendedDetails] = useState<EditableExtendedTaskDetails>(
    task.extendedDetails || {
      subSteps: [],
      resources: '',
      responsible: '',
      notes: '',
      numericalTarget: undefined,
      dueDate: '',
      reportDeck: undefined,
      resourceMatrix: null,
      attachments: [],
      decisions: [],
      subStepCanvasSize: { width: 1200, height: 800 },
    }
  );

  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<{ title: string; description: string; }[]>([]);

  const [isSlideEditorOpen, setIsSlideEditorOpen] = useState(false);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [slideError, setSlideError] = useState<string | null>(null);

  const [selectedActionItem, setSelectedActionItem] = useState<{ subStepId: string; actionItem: ActionItem } | null>(null);
  const [isActionItemTableOpen, setIsActionItemTableOpen] = useState(false);
  const [isCustomReportModalOpen, setIsCustomReportModalOpen] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedSubStep, setDraggedSubStep] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingState, setConnectingState] = useState<{ fromId: string; fromPos: { x: number; y: number } } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDefaultSubStepPosition = (index: number): { x: number; y: number } => ({
    x: 10, 
    y: index * 90 + 10, 
  });

  const updateExtendedDetailsState = (updates: Partial<EditableExtendedTaskDetails>) => {
    setExtendedDetails(prev => ({ ...prev, ...updates }));
  };

  const handleSave = () => {
    onUpdateTaskCoreInfo(task.id, { title, description, status });
    onUpdateExtendedDetails(task.id, extendedDetails);
    onClose();
  };

  const handleGenerateProposals = async () => {
    setIsGeneratingProposals(true);
    setProposalError(null);
    try {
      const currentTask = { ...task, title, description, extendedDetails };
      const results = await generateStepProposals(currentTask);
      setProposals(results);
      setIsProposalModalOpen(true);
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : 'ステップ提案の生成に失敗しました。');
    } finally {
      setIsGeneratingProposals(false);
    }
  };

  const handleConfirmProposals = ({ newSubSteps, newActionItems }: { newSubSteps: { title: string; description: string; }[], newActionItems: { targetSubStepId: string, title: string }[] }) => {
    const updatedSubSteps = [...extendedDetails.subSteps];
    
    newSubSteps.forEach((proposal, index) => {
      const newSubStep: SubStep = {
        id: generateUniqueId('substep'),
        text: proposal.title,
        notes: proposal.description,
        position: getDefaultSubStepPosition(updatedSubSteps.length + index),
        status: SubStepStatus.NOT_STARTED,
        actionItems: [],
      };
      updatedSubSteps.push(newSubStep);
    });

    newActionItems.forEach(({ targetSubStepId, title }) => {
      const targetSubStep = updatedSubSteps.find(ss => ss.id === targetSubStepId);
      if (targetSubStep) {
        const newActionItem: ActionItem = {
          id: generateUniqueId('action'),
          text: title,
          completed: false,
        };
        targetSubStep.actionItems = [...(targetSubStep.actionItems || []), newActionItem];
      }
    });

    updateExtendedDetailsState({ subSteps: updatedSubSteps });
    setIsProposalModalOpen(false);
  };

  const handleAddSubStep = () => {
    const newSubStep: SubStep = {
      id: generateUniqueId('substep'),
      text: '新しいサブステップ',
      position: getDefaultSubStepPosition(extendedDetails.subSteps.length),
      status: SubStepStatus.NOT_STARTED,
      actionItems: [],
    };
    updateExtendedDetailsState({ subSteps: [...extendedDetails.subSteps, newSubStep] });
  };

  const handleUpdateSubStep = (subStepId: string, updates: Partial<SubStep>) => {
    const updatedSubSteps = extendedDetails.subSteps.map(ss => 
      ss.id === subStepId ? { ...ss, ...updates } : ss
    );
    updateExtendedDetailsState({ subSteps: updatedSubSteps });
  };

  const handleDeleteSubStep = (subStepId: string) => {
    const updatedSubSteps = extendedDetails.subSteps
      .filter(ss => ss.id !== subStepId)
      .map(ss => ({
        ...ss,
        nextSubStepIds: (ss.nextSubStepIds || []).filter(id => id !== subStepId)
      }));
    updateExtendedDetailsState({ subSteps: updatedSubSteps });
  };

  const handleAddActionItem = (subStepId: string) => {
    const newActionItem: ActionItem = {
      id: generateUniqueId('action'),
      text: '新しいアクションアイテム',
      completed: false,
    };
    
    const updatedSubSteps = extendedDetails.subSteps.map(ss => 
      ss.id === subStepId 
        ? { ...ss, actionItems: [...(ss.actionItems || []), newActionItem] }
        : ss
    );
    updateExtendedDetailsState({ subSteps: updatedSubSteps });
  };

  const handleUpdateActionItem = (subStepId: string, actionItemId: string, updates: Partial<ActionItem>) => {
    const updatedSubSteps = extendedDetails.subSteps.map(ss => 
      ss.id === subStepId 
        ? {
            ...ss,
            actionItems: (ss.actionItems || []).map(ai => 
              ai.id === actionItemId ? { ...ai, ...updates } : ai
            )
          }
        : ss
    );
    updateExtendedDetailsState({ subSteps: updatedSubSteps });
  };

  const handleDeleteActionItem = (subStepId: string, actionItemId: string) => {
    const updatedSubSteps = extendedDetails.subSteps.map(ss => 
      ss.id === subStepId 
        ? { ...ss, actionItems: (ss.actionItems || []).filter(ai => ai.id !== actionItemId) }
        : ss
    );
    updateExtendedDetailsState({ subSteps: updatedSubSteps });
  };

  const handleGenerateSlides = async () => {
    setIsGeneratingSlides(true);
    setSlideError(null);
    try {
      const currentTask = { ...task, title, description, extendedDetails };
      const deck = await generateInitialSlideDeck(currentTask, projectGoal);
      updateExtendedDetailsState({ reportDeck: deck });
      setIsSlideEditorOpen(true);
    } catch (error) {
      setSlideError(error instanceof Error ? error.message : 'スライドの生成に失敗しました。');
    } finally {
      setIsGeneratingSlides(false);
    }
  };

  const handleOpenSlideEditor = () => {
    if (extendedDetails.reportDeck) {
      setIsSlideEditorOpen(true);
    } else {
      handleGenerateSlides();
    }
  };

  const handleSaveSlides = (deck: SlideDeck) => {
    updateExtendedDetailsState({ reportDeck: deck });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE_MB = 5;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    
    if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(`ファイルサイズが大きすぎます。${MAX_FILE_SIZE_MB}MB未満のファイルを選択してください。`);
        if (event.target) event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
            const newAttachment: Attachment = {
                id: generateUniqueId('attach'),
                name: file.name,
                type: file.type,
                dataUrl: e.target.result,
            };
            updateExtendedDetailsState({ 
              attachments: [...(extendedDetails.attachments || []), newAttachment]
            });
        }
    };
    reader.readAsDataURL(file);
    if (event.target) event.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    updateExtendedDetailsState({ 
      attachments: extendedDetails.attachments?.filter(a => a.id !== id) || []
    });
  };

  const handleSubStepDragStart = (e: React.DragEvent, subStepId: string) => {
    setDraggedSubStep(subStepId);
    const subStep = extendedDetails.subSteps.find(ss => ss.id === subStepId);
    if (subStep && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left - (subStep.position?.x || 0),
        y: e.clientY - rect.top - (subStep.position?.y || 0),
      });
    }
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedSubStep || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0, e.clientX - rect.left - dragOffset.x);
    const newY = Math.max(0, e.clientY - rect.top - dragOffset.y);

    handleUpdateSubStep(draggedSubStep, { position: { x: newX, y: newY } });
    setDraggedSubStep(null);
  };

  const handleStartConnection = (subStepId: string, event: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const fromPos = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setConnectingState({ fromId: subStepId, fromPos });
  };

  const handleEndConnection = (targetSubStepId: string) => {
    if (!connectingState || connectingState.fromId === targetSubStepId) {
      setConnectingState(null);
      return;
    }
    
    const sourceSubStep = extendedDetails.subSteps.find(ss => ss.id === connectingState.fromId);
    if (sourceSubStep) {
      const newNextSubStepIds = Array.from(new Set([...(sourceSubStep.nextSubStepIds || []), targetSubStepId]));
      handleUpdateSubStep(sourceSubStep.id, { nextSubStepIds: newNextSubStepIds });
    }
    setConnectingState(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!connectingState || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const allActionItems = useMemo(() => {
    const items: { actionItem: ActionItem; subStep: SubStep }[] = [];
    extendedDetails.subSteps.forEach(subStep => {
      (subStep.actionItems || []).forEach(actionItem => {
        items.push({ actionItem, subStep });
      });
    });
    return items;
  }, [extendedDetails.subSteps]);

  const getStatusColor = (status?: SubStepStatus) => {
    switch(status) {
      case SubStepStatus.COMPLETED: return '#22c55e';
      case SubStepStatus.IN_PROGRESS: return '#3b82f6';
      default: return '#94a3b8';
    }
  };

  const connectors = useMemo(() => {
    const newConnectors: Array<{id: string, from: {x:number, y:number}, to: {x:number, y:number}}> = [];
    extendedDetails.subSteps.forEach(sourceSubStep => {
      if (sourceSubStep.nextSubStepIds?.length && sourceSubStep.position) {
        const sourcePos = { x: sourceSubStep.position.x + 192, y: sourceSubStep.position.y + 38 };
        sourceSubStep.nextSubStepIds.forEach(targetId => {
          const targetSubStep = extendedDetails.subSteps.find(ss => ss.id === targetId);
          if (targetSubStep && targetSubStep.position) {
            const targetPos = { x: targetSubStep.position.x, y: targetSubStep.position.y + 38 };
            newConnectors.push({ id: `${sourceSubStep.id}-${targetId}`, from: sourcePos, to: targetPos });
          }
        });
      }
    });
    return newConnectors;
  }, [extendedDetails.subSteps]);

  if (isSlideEditorOpen && extendedDetails.reportDeck) {
    return (
      <SlideEditorView
        tasks={[{ ...task, title, description, extendedDetails }]}
        initialDeck={extendedDetails.reportDeck}
        onSave={handleSaveSlides}
        onClose={() => setIsSlideEditorOpen(false)}
        projectGoal={projectGoal}
        targetDate={targetDate}
        reportScope="task"
        generateUniqueId={generateUniqueId}
      />
    );
  }

  return (
    <>
      <div className={`fixed bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-[50] ${isFullscreen ? 'inset-0' : 'inset-0'}`}>
        <div className={`bg-white rounded-xl shadow-2xl flex flex-col ${isFullscreen ? 'w-full h-full' : 'w-full max-w-7xl max-h-[95vh]'}`}>
          <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
            <h3 className="text-xl font-bold text-slate-800 truncate mr-4">タスク詳細: {title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100"
                title={isFullscreen ? "ウィンドウ表示" : "フルスクリーン表示"}
              >
                {isFullscreen ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100"
                title="閉じる"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>
          </header>

          <div className="flex-grow flex overflow-hidden">
            <aside className="w-80 border-r border-slate-200 flex flex-col bg-slate-50">
              <div className="p-4 space-y-4 overflow-y-auto flex-grow">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">タスクタイトル</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">説明</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ステータス</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    {Object.values(TaskStatus).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                    <ResponsibleIcon className="w-4 h-4 mr-1" />
                    担当者
                  </label>
                  <input
                    type="text"
                    value={extendedDetails.responsible}
                    onChange={(e) => updateExtendedDetailsState({ responsible: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="担当者名"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">期日</label>
                  <input
                    type="date"
                    value={extendedDetails.dueDate || ''}
                    onChange={(e) => updateExtendedDetailsState({ dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                    <ResourcesIcon className="w-4 h-4 mr-1" />
                    必要リソース
                  </label>
                  <textarea
                    value={extendedDetails.resources}
                    onChange={(e) => updateExtendedDetailsState({ resources: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="必要な人員、設備、予算など"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                    <NotesIcon className="w-4 h-4 mr-1" />
                    メモ
                  </label>
                  <textarea
                    value={extendedDetails.notes}
                    onChange={(e) => updateExtendedDetailsState({ notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="追加のメモや注意事項"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">添付ファイル</label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-2 border-2 border-dashed border-slate-300 rounded-md hover:border-blue-400 text-sm text-slate-600 hover:text-blue-600"
                  >
                    ファイルを追加
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple={false}
                  />
                  {extendedDetails.attachments && extendedDetails.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {extendedDetails.attachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between p-2 bg-white rounded border text-xs">
                          <span className="truncate">{att.name}</span>
                          <button
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            <TrashIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 space-y-2">
                <button
                  onClick={handleGenerateProposals}
                  disabled={isGeneratingProposals}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-400 text-sm"
                >
                  {isGeneratingProposals ? <LoadingSpinner size="sm" color="border-white" /> : <SparklesIcon className="w-4 h-4" />}
                  AIでステップ提案
                </button>

                <button
                  onClick={handleOpenSlideEditor}
                  disabled={isGeneratingSlides}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-slate-400 text-sm"
                >
                  {isGeneratingSlides ? <LoadingSpinner size="sm" color="border-white" /> : <PresentationChartBarIcon className="w-4 h-4" />}
                  {extendedDetails.reportDeck ? 'レポート編集' : 'レポート作成'}
                </button>

                <button
                  onClick={() => setIsActionItemTableOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                >
                  <ClipboardDocumentListIcon className="w-4 h-4" />
                  このタスクのアクションアイテム一覧
                </button>

                <button
                  onClick={() => setIsCustomReportModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                >
                  <SparklesIcon className="w-4 h-4" />
                  カスタムレポート作成
                </button>

                <button
                  onClick={() => setIsDecisionModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm"
                >
                  <TableCellsIcon className="w-4 h-4" />
                  決定事項の管理
                </button>
              </div>
            </aside>

            <main className="flex-grow flex flex-col">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
                <h4 className="font-semibold text-slate-800">サブステップ計画 ({extendedDetails.subSteps.length})</h4>
                <button
                  onClick={handleAddSubStep}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  <PlusIcon className="w-4 h-4" />
                  サブステップ追加
                </button>
              </div>

              <div 
                ref={canvasRef}
                className="flex-grow relative overflow-auto bg-slate-100 p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleCanvasDrop}
                onMouseMove={handleMouseMove}
                onMouseUp={() => setConnectingState(null)}
                style={{ 
                  width: extendedDetails.subStepCanvasSize?.width || 1200,
                  height: extendedDetails.subStepCanvasSize?.height || 800,
                }}
              >
                {extendedDetails.subSteps.map((subStep) => (
                  <div
                    key={subStep.id}
                    draggable
                    onDragStart={(e) => handleSubStepDragStart(e, subStep.id)}
                    onMouseUp={() => handleEndConnection(subStep.id)}
                    className="absolute bg-white rounded-lg shadow-md border-l-4 p-3 cursor-move hover:shadow-lg transition-shadow"
                    style={{
                      left: subStep.position?.x || 0,
                      top: subStep.position?.y || 0,
                      width: 192,
                      minHeight: 76,
                      borderLeftColor: getStatusColor(subStep.status),
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <input
                        type="text"
                        value={subStep.text}
                        onChange={(e) => handleUpdateSubStep(subStep.id, { text: e.target.value })}
                        className="font-semibold text-sm bg-transparent border-none outline-none flex-grow mr-2"
                        placeholder="サブステップ名"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onMouseDown={(e) => handleStartConnection(subStep.id, e)}
                          className="w-3 h-3 bg-blue-500 rounded-full hover:bg-blue-600"
                          title="接続"
                        />
                        <button
                          onClick={() => handleDeleteSubStep(subStep.id)}
                          className="text-red-500 hover:text-red-700"
                          title="削除"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <select
                      value={subStep.status || SubStepStatus.NOT_STARTED}
                      onChange={(e) => handleUpdateSubStep(subStep.id, { status: e.target.value as SubStepStatus })}
                      className="text-xs mb-2 w-full border border-slate-300 rounded px-1 py-0.5"
                    >
                      {Object.values(SubStepStatus).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                    <div className="space-y-1">
                      {(subStep.actionItems || []).map((actionItem) => (
                        <div key={actionItem.id} className="flex items-center gap-1 text-xs">
                          <button
                            onClick={() => handleUpdateActionItem(subStep.id, actionItem.id, { completed: !actionItem.completed })}
                            className="flex-shrink-0"
                          >
                            {actionItem.completed ? 
                              <CheckSquareIcon className="w-3 h-3 text-green-600" /> : 
                              <SquareIcon className="w-3 h-3 text-slate-400" />
                            }
                          </button>
                          <input
                            type="text"
                            value={actionItem.text}
                            onChange={(e) => handleUpdateActionItem(subStep.id, actionItem.id, { text: e.target.value })}
                            className="flex-grow bg-transparent border-none outline-none text-xs"
                            placeholder="アクションアイテム"
                          />
                          <button
                            onClick={() => setSelectedActionItem({ subStepId: subStep.id, actionItem })}
                            className="text-blue-500 hover:text-blue-700"
                            title="レポート"
                          >
                            <PaperClipIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteActionItem(subStep.id, actionItem.id)}
                            className="text-red-500 hover:text-red-700"
                            title="削除"
                          >
                            <TrashIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => handleAddActionItem(subStep.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <PlusIcon className="w-3 h-3" />
                        アクション追加
                      </button>
                    </div>
                  </div>
                ))}

                {/* 接続線の描画 */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                  {connectors.map(conn => (
                    <line
                      key={conn.id}
                      x1={conn.from.x}
                      y1={conn.from.y}
                      x2={conn.to.x}
                      y2={conn.to.y}
                      stroke="#64748b"
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                    />
                  ))}
                  {connectingState && (
                    <line
                      x1={connectingState.fromPos.x}
                      y1={connectingState.fromPos.y}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                    />
                  )}
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                    </marker>
                  </defs>
                </svg>
              </div>
            </main>
          </div>

          <footer className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
            {proposalError && <ErrorMessage message={proposalError} />}
            {slideError && <ErrorMessage message={slideError} />}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700"
            >
              変更を保存
            </button>
          </footer>
        </div>
      </div>

      {isProposalModalOpen && (
        <ProposalReviewModal
          proposals={proposals}
          existingSubSteps={extendedDetails.subSteps}
          onConfirm={handleConfirmProposals}
          onClose={() => setIsProposalModalOpen(false)}
        />
      )}

      {selectedActionItem && (
        <ActionItemReportModal
          actionItem={selectedActionItem.actionItem}
          onSave={(updatedItem) => {
            handleUpdateActionItem(selectedActionItem.subStepId, updatedItem.id, updatedItem);
            setSelectedActionItem(null);
          }}
          onClose={() => setSelectedActionItem(null)}
          generateUniqueId={generateUniqueId}
        />
      )}

      {isActionItemTableOpen && (
        <ActionItemTableModal
          items={allActionItems}
          taskName={title}
          onClose={() => setIsActionItemTableOpen(false)}
          onUpdateActionItem={handleUpdateActionItem}
        />
      )}

      {isCustomReportModalOpen && (
        <CustomTaskReportModal
          task={{ ...task, title, description, extendedDetails }}
          isOpen={isCustomReportModalOpen}
          onClose={() => setIsCustomReportModalOpen(false)}
          onReportGenerated={(deck) => {
            updateExtendedDetailsState({ reportDeck: deck });
            setIsCustomReportModalOpen(false);
            setIsSlideEditorOpen(true);
          }}
        />
      )}

      {isDecisionModalOpen && (
        <DecisionModal
          isOpen={isDecisionModalOpen}
          onClose={() => setIsDecisionModalOpen(false)}
          onSave={(decisions) => {
            updateExtendedDetailsState({ decisions });
            setIsDecisionModalOpen(false);
          }}
          task={{ ...task, title, description, extendedDetails }}
          generateUniqueId={generateUniqueId}
        />
      )}
    </>
  );
};

export default TaskDetailModal;