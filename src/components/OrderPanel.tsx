import { useShallow } from 'zustand/react/shallow';
import { useGameStore, selectCurrentOrder, selectAvailableOrders, useCurrentBundle, useBundleOrders, useBundleableOrders } from '../store/gameStore';
import { getOrderStatusText, getUrgencyText } from '../game/OrderSystem';
import { formatMoney } from '../game/EconomySystem';
import { canBundleOrders } from '../game/BundleSystem';
import { Package, MapPin, Clock, AlertTriangle, Check, Route, Scissors, Zap } from 'lucide-react';

export default function OrderPanel() {
  const dispatch = useGameStore((state) => state.dispatch);
  const player = useGameStore((state) => state.player);
  const map = useGameStore((state) => state.map);
  const isRushHour = useGameStore((state) => state.isRushHour);
  const currentOrder = useGameStore(useShallow(selectCurrentOrder));
  const availableOrders = useGameStore(useShallow(selectAvailableOrders));
  const currentBundle = useCurrentBundle();
  const bundleOrders = useBundleOrders();
  const bundleableOrders = useBundleableOrders();

  const formatDeadline = (seconds: number) => {
    if (seconds <= 0) return '已超时';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDeadlineColor = (deadline: number, maxDeadline: number) => {
    const ratio = deadline / maxDeadline;
    if (ratio < 0.3) return 'text-game-danger animate-pulse';
    if (ratio < 0.6) return 'text-game-streetLight';
    return 'text-game-success';
  };

  const handleAcceptOrder = (orderId: string) => {
    if (player.currentOrderId) return;
    dispatch({ type: 'ACCEPT_ORDER', orderId });
  };

  const handleShowBundlePreview = (secondaryOrderId: string) => {
    if (!player.currentOrderId) return;
    dispatch({
      type: 'SHOW_BUNDLE_PREVIEW',
      primaryOrderId: player.currentOrderId,
      secondaryOrderId,
    });
  };

  const handleUnbundleOrder = (orderId: string) => {
    dispatch({ type: 'UNBUNDLE_ORDER', orderId, reason: '玩家主动拆单' });
  };

  const getEligibleBundleOrders = () => {
    if (!currentOrder) return [];
    return bundleableOrders.filter((o) =>
      canBundleOrders(currentOrder, o, map, player.position)
    );
  };

  const eligibleBundleOrders = getEligibleBundleOrders();

  return (
    <div className="game-card p-4 w-80 space-y-4 max-h-[600px] flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-pixel text-sm text-game-neon glow-text">订单中心</h3>
        {isRushHour && (
          <div className="flex items-center gap-1 bg-game-streetLight/20 px-2 py-1 rounded animate-pulse">
            <Zap size={12} className="text-game-streetLight" />
            <span className="font-retro text-xs text-game-streetLight">晚高峰</span>
          </div>
        )}
      </div>

      {currentBundle && bundleOrders.length > 0 && (
        <div className="bg-game-neon/10 border-2 border-game-neon rounded p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route size={14} className="text-game-neon" />
              <span className="font-pixel text-xs text-game-neon">拼单配送 ({bundleOrders.length}单)</span>
            </div>
            <button
              onClick={() => handleUnbundleOrder(currentBundle.orderIds[1] || currentBundle.orderIds[0])}
              className="flex items-center gap-1 px-2 py-1 bg-game-danger/20 hover:bg-game-danger/30 rounded transition-colors"
              title="拆单（扣除信誉和部分费用）"
            >
              <Scissors size={12} className="text-game-danger" />
              <span className="font-retro text-xs text-game-danger">拆单</span>
            </button>
          </div>

          <div className="space-y-2">
            {currentBundle.steps.map((step, idx) => {
              const order = bundleOrders.find(o => o.id === step.orderId);
              if (!order) return null;
              const isCurrentStep = idx === currentBundle.currentStepIndex;
              const isCompleted = step.completed;

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 p-2 rounded border ${
                    isCurrentStep
                      ? 'bg-game-neon/20 border-game-neon'
                      : isCompleted
                      ? 'bg-gray-800/50 border-gray-700 opacity-60'
                      : 'bg-gray-900/50 border-gray-700'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted ? 'bg-game-success/30' : isCurrentStep ? 'bg-game-neon/30 animate-pulse' : 'bg-gray-700'
                  }`}>
                    <span className={`text-xs font-bold ${
                      isCompleted ? 'text-game-success' : isCurrentStep ? 'text-game-neon' : 'text-gray-500'
                    }`}>
                      {idx + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-retro ${
                        step.type === 'pickup' ? 'text-game-success' : 'text-game-danger'
                      }`}>
                        {step.type === 'pickup' ? '取货' : '送货'}
                      </span>
                      {isCurrentStep && (
                        <span className="text-game-neon text-xs font-retro">← 当前</span>
                      )}
                    </div>
                    <div className="font-retro text-xs text-gray-400 truncate">
                      {step.location.name}
                    </div>
                  </div>
                  {order && (
                    <span className={`font-retro text-xs ${
                      getDeadlineColor(order.deadline, order.maxDeadline)
                    }`}>
                      {formatDeadline(order.deadline)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-700">
            <span className="font-retro text-xs text-gray-400">合计收入</span>
            <span className="font-retro text-lg text-game-streetLight">
              {formatMoney(bundleOrders.reduce((sum, o) => sum + o.reward, 0))}
            </span>
          </div>
        </div>
      )}

      {currentOrder && !currentBundle && (
        <div className="bg-game-neon/10 border-2 border-game-neon rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-xs text-game-neon">当前订单</span>
            <span className={`font-retro text-xs px-2 py-0.5 rounded ${
              currentOrder.status === 'accepted' ? 'bg-blue-500/30 text-blue-400' :
              'bg-orange-500/30 text-orange-400'
            }`}>
              {getOrderStatusText(currentOrder.status)}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-game-success mt-1 flex-shrink-0" />
              <div>
                <div className="font-retro text-xs text-gray-400">取货点</div>
                <div className="font-retro text-sm text-game-success">{currentOrder.pickupLocation.name}</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-game-danger mt-1 flex-shrink-0" />
              <div>
                <div className="font-retro text-xs text-gray-400">送货点</div>
                <div className="font-retro text-sm text-game-danger">{currentOrder.deliveryLocation.name}</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Clock size={14} className={getDeadlineColor(currentOrder.deadline, currentOrder.maxDeadline)} />
                <span className={`font-retro text-sm ${getDeadlineColor(currentOrder.deadline, currentOrder.maxDeadline)}`}>
                  {formatDeadline(currentOrder.deadline)}
                </span>
              </div>
              <div className="text-right">
                <div className="font-retro text-lg text-game-streetLight">{formatMoney(currentOrder.reward)}</div>
                <div className="font-retro text-xs text-gray-500">距离: {currentOrder.distance}格</div>
              </div>
            </div>

            {currentOrder.customerUrgency >= 4 && (
              <div className="flex items-center gap-1 bg-game-danger/20 rounded px-2 py-1">
                <AlertTriangle size={12} className="text-game-danger" />
                <span className="font-retro text-xs text-game-danger">
                  {getUrgencyText(currentOrder.customerUrgency)}！客户在催单
                </span>
              </div>
            )}

            <div className="text-xs font-retro text-gray-400 mt-2 p-2 bg-game-night/70 rounded border border-game-neon/30">
              {currentOrder.status === 'accepted' && '🎯 第一步：沿青色虚线路径开到绿色标记的取货点'}
              {currentOrder.status === 'pickedup' && '🎯 第二步：沿青色虚线路径开到红色标记的送货点'}
              {currentOrder.status === 'delivering' && '🎯 正在配送中，请沿路径行驶至送货点'}
            </div>
          </div>
        </div>
      )}

      {!currentBundle && eligibleBundleOrders.length > 0 && (
        <div className="bg-game-streetLight/10 border border-game-streetLight/50 rounded p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Route size={14} className="text-game-streetLight" />
            <span className="font-pixel text-xs text-game-streetLight">
              💡 发现 {eligibleBundleOrders.length} 个可拼单
            </span>
          </div>
          <div className="font-retro text-xs text-gray-400">
            取货点接近、路线顺，顺路多赚{isRushHour ? '更多' : ''}！
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        <h4 className="font-pixel text-xs text-gray-400 sticky top-0 bg-game-nightLight py-1">
          可用订单 ({availableOrders.length})
        </h4>

        {availableOrders.length === 0 ? (
          <div className="text-center py-8">
            <Package size={32} className="mx-auto text-gray-600 mb-2" />
            <p className="font-retro text-sm text-gray-500">暂无可用订单</p>
            <p className="font-retro text-xs text-gray-600">请稍候，新订单即将到来...</p>
          </div>
        ) : (
          availableOrders.map((order) => {
            const isEligibleForBundle = eligibleBundleOrders.some(o => o.id === order.id);

            return (
              <div
                key={order.id}
                className={`bg-game-night/50 border rounded p-3 hover:border-game-neon/50 transition-all space-y-2 ${
                  isEligibleForBundle ? 'border-game-streetLight/50' : 'border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-retro text-xs text-gray-400">
                      {order.pickupLocation.name} → {order.deliveryLocation.name}
                    </div>
                    <div className="font-retro text-lg text-game-streetLight">{formatMoney(order.reward)}</div>
                  </div>
                  <span className={`font-retro text-xs ${getDeadlineColor(order.deadline, order.maxDeadline)}`}>
                    ⏱ {formatDeadline(order.deadline)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs font-retro text-gray-400">
                    <span>距离: {order.distance}格</span>
                    <span className={order.customerUrgency >= 4 ? 'text-game-danger' : ''}>
                      紧急度: {'⭐'.repeat(order.customerUrgency)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {isEligibleForBundle && (
                      <button
                        onClick={() => handleShowBundlePreview(order.id)}
                        className="pixel-btn pixel-btn-primary text-xs"
                      >
                        <Route size={12} className="inline mr-1" />
                        合并
                      </button>
                    )}
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      disabled={!!player.currentOrderId}
                      className={`pixel-btn pixel-btn-success text-xs ${
                        player.currentOrderId ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <Check size={12} className="inline mr-1" />
                      接单
                    </button>
                  </div>
                </div>

                {isEligibleForBundle && (
                  <div className="flex items-center gap-1 bg-game-streetLight/10 rounded px-2 py-1">
                    <Route size={10} className="text-game-streetLight" />
                    <span className="font-retro text-xs text-game-streetLight">
                      可与当前订单拼单
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!player.currentOrderId && availableOrders.length > 0 && (
        <div className="text-xs font-retro text-gray-500 text-center border-t border-gray-700 pt-2">
          💡 点击"接单"按钮接受订单
        </div>
      )}
    </div>
  );
}
