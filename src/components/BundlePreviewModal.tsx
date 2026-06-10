import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/gameStore';
import { formatMoney } from '../game/EconomySystem';
import { MapPin, Clock, AlertTriangle, TrendingUp, Route, X, Check, Zap } from 'lucide-react';

export default function BundlePreviewModal() {
  const dispatch = useGameStore((state) => state.dispatch);
  const showBundlePreview = useGameStore((state) => state.showBundlePreview);
  const bundlePreview = useGameStore((state) => state.bundlePreview);
  const orders = useGameStore(useShallow((state) => state.orders));

  if (!showBundlePreview || !bundlePreview) return null;

  const primaryOrder = orders.find((o) => o.id === bundlePreview.primaryOrderId);
  const secondaryOrder = orders.find((o) => o.id === bundlePreview.secondaryOrderId);

  if (!primaryOrder || !secondaryOrder) return null;

  const atRiskOrder = bundlePreview.atRiskOrderId 
    ? orders.find((o) => o.id === bundlePreview.atRiskOrderId)
    : null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.ceil(seconds)}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}分${secs}秒`;
  };

  const handleAccept = () => {
    dispatch({ type: 'ACCEPT_BUNDLE', preview: bundlePreview });
  };

  const handleDecline = () => {
    dispatch({ type: 'DECLINE_BUNDLE' });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="game-card p-6 w-[500px] max-w-[90vw] space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-game-neon/20 rounded-lg flex items-center justify-center">
              <Route size={24} className="text-game-neon" />
            </div>
            <div>
              <h3 className="font-pixel text-lg text-game-neon glow-text">晚高峰拼单</h3>
              {bundlePreview.isRushHour && (
                <div className="flex items-center gap-1 mt-1">
                  <Zap size={12} className="text-game-streetLight" />
                  <span className="font-retro text-xs text-game-streetLight">晚高峰加成 +50%</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleDecline}
            className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
          >
            <X size={16} className="text-gray-300" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-game-night/50 border border-gray-700 rounded-lg p-3">
            <div className="font-pixel text-xs text-game-neon mb-2">订单 1 (当前)</div>
            <div className="space-y-2">
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-game-success mt-0.5 flex-shrink-0" />
                <div className="font-retro text-xs text-gray-300">
                  {primaryOrder.pickupLocation.name}
                </div>
              </div>
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-game-danger mt-0.5 flex-shrink-0" />
                <div className="font-retro text-xs text-gray-300">
                  {primaryOrder.deliveryLocation.name}
                </div>
              </div>
              <div className="font-retro text-sm text-game-streetLight">
                {formatMoney(primaryOrder.reward)}
              </div>
            </div>
          </div>

          <div className="bg-game-neon/10 border-2 border-game-neon rounded-lg p-3">
            <div className="font-pixel text-xs text-game-neon mb-2">订单 2 (拼单)</div>
            <div className="space-y-2">
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-game-success mt-0.5 flex-shrink-0" />
                <div className="font-retro text-xs text-gray-300">
                  {secondaryOrder.pickupLocation.name}
                </div>
              </div>
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-game-danger mt-0.5 flex-shrink-0" />
                <div className="font-retro text-xs text-gray-300">
                  {secondaryOrder.deliveryLocation.name}
                </div>
              </div>
              <div className="font-retro text-sm text-game-streetLight">
                {formatMoney(secondaryOrder.reward)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-game-night/50 border border-gray-700 rounded-lg p-4 space-y-3">
          <h4 className="font-pixel text-sm text-gray-300">合并分析</h4>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route size={14} className="text-gray-400" />
                <span className="font-retro text-sm text-gray-400">预计多走路程</span>
              </div>
              <span className="font-retro text-sm text-game-streetLight">
                +{bundlePreview.extraDistance} 格
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400" />
                <span className="font-retro text-sm text-gray-400">预计多花时间</span>
              </div>
              <span className="font-retro text-sm text-game-streetLight">
                +{formatTime(bundlePreview.extraTime)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-game-success" />
                <span className="font-retro text-sm text-gray-400">预计多赚</span>
              </div>
              <span className="font-retro text-sm text-game-success">
                +{formatMoney(bundlePreview.extraReward)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-gray-700 pt-2">
              <span className="font-retro text-sm text-gray-300">合计收入</span>
              <span className="font-retro text-lg text-game-neon">
                {formatMoney(bundlePreview.totalReward)}
              </span>
            </div>
          </div>
        </div>

        {atRiskOrder && (
          <div className="bg-game-danger/10 border border-game-danger/50 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-game-danger mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-retro text-sm text-game-danger font-bold">超时风险警告</div>
                <div className="font-retro text-xs text-gray-400 mt-1">
                  「{atRiskOrder.pickupLocation.name} → {atRiskOrder.deliveryLocation.name}」
                  预计可能超时约 {bundlePreview.atRiskMinutes} 分钟
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-game-night/30 rounded-lg p-3 border border-gray-700">
          <div className="font-retro text-xs text-gray-500">
            📋 配送顺序：
            {bundlePreview.steps.map((step, idx) => (
              <span key={idx} className="text-gray-400">
                {idx > 0 && ' → '}
                <span className={step.type === 'pickup' ? 'text-game-success' : 'text-game-danger'}>
                  {step.type === 'pickup' ? '取' : '送'}
                </span>
                {orders.find(o => o.id === step.orderId)?.pickupLocation.name.split('').slice(0, 4).join('')}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 pixel-btn pixel-btn-danger"
          >
            <X size={16} className="inline mr-2" />
            暂不合并
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 pixel-btn pixel-btn-success"
          >
            <Check size={16} className="inline mr-2" />
            确认合并
          </button>
        </div>
      </div>
    </div>
  );
}
