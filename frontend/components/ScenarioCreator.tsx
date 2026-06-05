'use client';

import { useState } from 'react';
import { Scenario, Difficulty } from '@/types';

interface ScenarioCreatorProps {
  onClose: () => void;
  onCreate: (scenario: Scenario) => void;
}

export default function ScenarioCreator({
  onClose,
  onCreate,
}: ScenarioCreatorProps) {
  const [name, setName] = useState('');
  const [nameZh, setNameZh] = useState('');
  const [icon, setIcon] = useState('💬');
  const [descriptionZh, setDescriptionZh] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [roleDescription, setRoleDescription] = useState('');
  const [starterMessage, setStarterMessage] = useState('');

  const emojiOptions = ['💬', '🎓', '🏥', '🛒', '🎉', '🏠', '🚗', '💼', '🎮', '🌍', '🎵', '📚'];

  const handleSubmit = () => {
    if (!name.trim() || !roleDescription.trim()) return;

    const scenario: Scenario = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      nameZh: nameZh.trim() || name.trim(),
      icon,
      description: `Practice English in a ${name} scenario.`,
      descriptionZh: descriptionZh.trim() || `在${nameZh || name}场景中练习英语。`,
      difficulty,
      estimatedMinutes: 10,
      systemPrompt: `You are playing a role in an English speaking practice scenario.

SCENARIO: ${name}
YOUR ROLE: ${roleDescription}

BEHAVIOR RULES:
- Stay in character at all times
- Speak naturally and at an appropriate pace
- If the user makes grammar or vocabulary errors, note them but don't interrupt the conversation flow
- Gently model correct expressions in your responses
- Keep the conversation going by asking follow-up questions
- Be encouraging and supportive

CORRECTION APPROACH:
- For major errors: use the provide_correction tool
- For minor errors: naturally rephrase in your response
- Focus on helping the user communicate effectively`,
      starterMessage:
        starterMessage.trim() ||
        `Hello! Welcome to our ${name.toLowerCase()} practice session. I'll be playing my role, and you can respond naturally. Let's get started! How can I help you today?`,
      keyVocabulary: [],
      isCustom: true,
    };

    onCreate(scenario);
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">✨ 创建自定义场景</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Icon Selection */}
          <div className="input-group">
            <label className="input-label">选择图标</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {emojiOptions.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  style={{
                    fontSize: '1.5rem',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    background: icon === emoji ? 'rgba(59,130,246,0.15)' : 'transparent',
                    border: icon === emoji ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Scene Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="input-group">
              <label className="input-label">场景名称（英文）*</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Doctor Visit"
              />
            </div>
            <div className="input-group">
              <label className="input-label">场景名称（中文）</label>
              <input
                className="input"
                value={nameZh}
                onChange={(e) => setNameZh(e.target.value)}
                placeholder="例：看医生"
              />
            </div>
          </div>

          {/* Description */}
          <div className="input-group">
            <label className="input-label">场景描述（中文，可选）</label>
            <input
              className="input"
              value={descriptionZh}
              onChange={(e) => setDescriptionZh(e.target.value)}
              placeholder="简要描述这个场景的练习内容"
            />
          </div>

          {/* Difficulty */}
          <div className="input-group">
            <label className="input-label">难度</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map(
                (d) => (
                  <button
                    key={d}
                    className={`badge badge-${d}`}
                    onClick={() => setDifficulty(d)}
                    style={{
                      cursor: 'pointer',
                      opacity: difficulty === d ? 1 : 0.4,
                      transform: difficulty === d ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      padding: '0.35rem 0.75rem',
                    }}
                  >
                    {d === 'beginner'
                      ? '初级'
                      : d === 'intermediate'
                        ? '中级'
                        : '高级'}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* AI Role Description */}
          <div className="input-group">
            <label className="input-label">AI 角色设定 *</label>
            <textarea
              className="textarea"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="描述 AI 在这个场景中扮演的角色，例如：&#10;你是一名友好的医生，正在为患者进行日常体检。你会询问症状、给出建议..."
              rows={4}
            />
          </div>

          {/* Starter Message */}
          <div className="input-group">
            <label className="input-label">开场白（英文，可选）</label>
            <textarea
              className="textarea"
              value={starterMessage}
              onChange={(e) => setStarterMessage(e.target.value)}
              placeholder="AI 开始对话时说的第一句话，例如：&#10;Good morning! I'm Dr. Smith. What brings you in today?"
              rows={2}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !roleDescription.trim()}
          >
            创建场景
          </button>
        </div>
      </div>
    </>
  );
}
