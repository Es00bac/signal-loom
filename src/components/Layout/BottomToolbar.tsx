import React from 'react';
import { Archive, Film, GitBranch, Image, Music, SlidersHorizontal, Type, Video } from 'lucide-react';
import type { FlowNodeType } from '../../types/flow';

interface BottomToolbarProps {
  onAddNode: (type: FlowNodeType) => void;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({ onAddNode }) => {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#252830] border border-gray-700 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md">
      <ToolbarButton
        icon={<Type size={18} />}
        label="Text"
        tooltip="Add a prompt or text-generation node"
        onClick={() => onAddNode('textNode')}
      />
      <ToolbarButton
        icon={<Image size={18} />}
        label="Image"
        tooltip="Add an image-generation node"
        onClick={() => onAddNode('imageGen')}
      />
      <ToolbarButton
        icon={<Video size={18} />}
        label="Video"
        tooltip="Add a video-generation node"
        onClick={() => onAddNode('videoGen')}
      />
      <ToolbarButton
        icon={<Music size={18} />}
        label="Audio"
        tooltip="Add an audio-generation node"
        onClick={() => onAddNode('audioGen')}
      />
      <ToolbarButton
        icon={<Film size={18} />}
        label="Compose"
        tooltip="Add a composition node"
        onClick={() => onAddNode('composition')}
      />
      <ToolbarButton
        icon={<Archive size={18} />}
        label="Bin"
        tooltip="Add a source bin for the manual editor"
        onClick={() => onAddNode('sourceBin')}
      />
      <ToolbarButton
        icon={<GitBranch size={18} />}
        label="Virtual"
        tooltip="Add a virtual alias node for reusing an upstream node elsewhere"
        onClick={() => onAddNode('virtual')}
      />
      <ToolbarButton
        icon={<SlidersHorizontal size={18} />}
        label="Config"
        tooltip="Add a config node"
        onClick={() => onAddNode('settings')}
      />
    </div>
  );
};

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  onClick: () => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, label, tooltip, onClick }) => (
  <button
    onClick={onClick}
    title={tooltip}
    className="flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm text-gray-300 transition-all duration-200 hover:border-gray-600 hover:bg-gray-700/50 hover:text-white"
    type="button"
  >
    {icon}
    <span>{label}</span>
  </button>
);
