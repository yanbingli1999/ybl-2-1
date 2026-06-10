import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { GameState, GameAction, Order } from '../game/types';
import { generateMapData, findPath } from '../game/mapData';
import { generateOrder, updateOrderDeadlines, isAtLocation, canAcceptOrder } from '../game/OrderSystem';
import { updateWeather, createInitialWeather } from '../game/WeatherSystem';
import {
  generateBundlePreview,
  createBundledOrder,
  getCurrentBundleTarget,
  isRushHour,
} from '../game/BundleSystem';
import {
  moveVehicle,
  createInitialVehicle,
  chargeVehicle,
  repairVehicle,
  restPlayer,
  isNearChargingStation,
  isNearRepairShop,
} from '../game/VehicleSystem';
import { calculateSettlement } from '../game/EconomySystem';
import { saveGame, loadGame } from '../game/Storage';
import {
  PLAYER_START,
  MAX_AVAILABLE_ORDERS,
  INITIAL_REPUTATION,
  MAX_REPUTATION,
  UNBUNDLE_REPUTATION_PENALTY,
  UNBUNDLE_MONEY_PENALTY_RATE,
} from '../game/constants';

export function createInitialState(): GameState {
  const map = generateMapData();
  return {
    player: {
      id: 'player-1',
      name: '送货员',
      money: 100,
      stamina: 100,
      maxStamina: 100,
      position: { ...PLAYER_START },
      currentOrderId: null,
      currentBundleId: null,
      reputation: INITIAL_REPUTATION,
      maxReputation: MAX_REPUTATION,
      completedOrders: 0,
      totalRating: 0,
    },
    vehicle: createInitialVehicle(),
    weather: createInitialWeather(),
    orders: [],
    bundledOrders: [],
    bundlePreview: null,
    showBundlePreview: false,
    incomeRecords: [],
    map,
    gameTime: 64800,
    isPaused: false,
    isGameOver: false,
    showSettlement: false,
    lastSettlement: null,
    plannedPath: [],
    isCharging: false,
    isRepairing: false,
    isResting: false,
    isRushHour: false,
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'MOVE': {
      if (state.isPaused || state.isGameOver || state.isCharging || state.isRepairing || state.isResting) {
        return state;
      }

      const { vehicle, moved, staminaDrain } = moveVehicle(
        state.vehicle,
        action.direction,
        state.weather,
        1 / 60,
        state.map.roads,
        state.player.stamina
      );

      if (!moved) return state;

      const newPlayer = {
        ...state.player,
        position: vehicle.position,
        stamina: Math.max(0, state.player.stamina - staminaDrain),
      };
      let newPlannedPath = state.plannedPath;

      if (newPlannedPath.length > 0) {
        const nextPoint = newPlannedPath[0];
        if (isAtLocation(vehicle.position, nextPoint, 20)) {
          newPlannedPath = newPlannedPath.slice(1);
        }
      }

      return {
        ...state,
        player: newPlayer,
        vehicle,
        plannedPath: newPlannedPath,
      };
    }

    case 'ACCEPT_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || !canAcceptOrder(order, state.player)) return state;

      const path = findPath(
        state.vehicle.position.x,
        state.vehicle.position.y,
        order.pickupLocation.x,
        order.pickupLocation.y,
        state.map.roads,
        state.map.gridSize
      );

      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'accepted' as const } : o
        ),
        player: { ...state.player, currentOrderId: action.orderId },
        plannedPath: path,
      };
    }

    case 'PICKUP_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== 'accepted') return state;

      if (!isAtLocation(state.player.position, order.pickupLocation, 50)) return state;

      const path = findPath(
        state.vehicle.position.x,
        state.vehicle.position.y,
        order.deliveryLocation.x,
        order.deliveryLocation.y,
        state.map.roads,
        state.map.gridSize
      );

      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'pickedup' as const } : o
        ),
        plannedPath: path,
      };
    }

    case 'DELIVER_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || (order.status !== 'pickedup' && order.status !== 'delivering')) return state;

      if (!isAtLocation(state.player.position, order.deliveryLocation, 50)) return state;

      const settlement = calculateSettlement(order, state.player.stamina);
      const bundleBonus = order.bundleBonus || 0;
      const finalAmountWithBonus = settlement.record.finalAmount + bundleBonus;

      let newState: GameState = {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'completed' as const } : o
        ),
        player: {
          ...state.player,
          money: state.player.money + finalAmountWithBonus,
          currentOrderId: null,
          completedOrders: state.player.completedOrders + 1,
          totalRating: state.player.totalRating + settlement.rating,
        },
        incomeRecords: [...state.incomeRecords, {
          ...settlement.record,
          finalAmount: finalAmountWithBonus,
          bonus: settlement.record.bonus + bundleBonus,
          details: bundleBonus > 0 
            ? `${settlement.record.details} | 拼单奖金: +¥${bundleBonus}` 
            : settlement.record.details,
        }],
        showSettlement: true,
        lastSettlement: {
          ...settlement.record,
          finalAmount: finalAmountWithBonus,
          bonus: settlement.record.bonus + bundleBonus,
          details: bundleBonus > 0 
            ? `${settlement.record.details} | 拼单奖金: +¥${bundleBonus}` 
            : settlement.record.details,
        },
        plannedPath: [],
      };

      if (order.bundleId) {
        const bundle = newState.bundledOrders.find((b) => b.id === order.bundleId);
        if (bundle) {
          const remainingOrders = bundle.orderIds.filter(
            (id) => id !== order.id && newState.orders.find((o) => o.id === id)?.status !== 'completed'
          );
          if (remainingOrders.length === 0) {
            newState.bundledOrders = newState.bundledOrders.map((b) =>
              b.id === order.bundleId ? { ...b, status: 'completed' as const } : b
            );
            newState.player = { ...newState.player, currentBundleId: null };
          } else {
            newState.player = { ...newState.player, currentOrderId: remainingOrders[0] };
            newState = gameReducer(newState, { type: 'ADVANCE_BUNDLE_STEP' });
          }
        }
      }

      return newState;
    }

    case 'SHOW_BUNDLE_PREVIEW': {
      const primaryOrder = state.orders.find((o) => o.id === action.primaryOrderId);
      const secondaryOrder = state.orders.find((o) => o.id === action.secondaryOrderId);

      if (!primaryOrder || !secondaryOrder) return state;

      const preview = generateBundlePreview(
        primaryOrder,
        secondaryOrder,
        state.map,
        state.player.position,
        state.isRushHour
      );

      if (!preview) return state;

      return {
        ...state,
        bundlePreview: preview,
        showBundlePreview: true,
      };
    }

    case 'ACCEPT_BUNDLE': {
      const { preview } = action;

      const bundledOrder = createBundledOrder(preview, state.gameTime);

      const updatedOrders = state.orders.map((o) => {
        if (o.id === preview.primaryOrderId) {
          return { ...o, bundleId: preview.bundleId, bundleOrder: 0, bundleBonus: 0 };
        }
        if (o.id === preview.secondaryOrderId) {
          return { ...o, status: 'accepted' as const, bundleId: preview.bundleId, bundleOrder: 1, bundleBonus: preview.bundleBonus };
        }
        return o;
      });

      const firstStep = bundledOrder.steps[0];
      const path = findPath(
        state.vehicle.position.x,
        state.vehicle.position.y,
        firstStep.location.x,
        firstStep.location.y,
        state.map.roads,
        state.map.gridSize
      );

      return {
        ...state,
        orders: updatedOrders,
        bundledOrders: [...state.bundledOrders, bundledOrder],
        player: {
          ...state.player,
          currentBundleId: preview.bundleId,
        },
        bundlePreview: null,
        showBundlePreview: false,
        plannedPath: path,
      };
    }

    case 'DECLINE_BUNDLE': {
      return {
        ...state,
        bundlePreview: null,
        showBundlePreview: false,
      };
    }

    case 'UNBUNDLE_ORDER': {
      const orderToRemove = state.orders.find((o) => o.id === action.orderId);
      if (!orderToRemove || !orderToRemove.bundleId) return state;

      const bundle = state.bundledOrders.find((b) => b.id === orderToRemove.bundleId);
      if (!bundle || bundle.status !== 'active') return state;

      const penalty = Math.floor(orderToRemove.reward * UNBUNDLE_MONEY_PENALTY_RATE);

      const updatedOrders = state.orders.map((o) => {
        if (o.id === action.orderId) {
          return { ...o, status: 'available' as const, bundleId: null, bundleOrder: null, bundleBonus: 0 };
        }
        if (o.bundleId === orderToRemove.bundleId && o.id !== action.orderId) {
          return { ...o, bundleId: null, bundleOrder: null, bundleBonus: 0 };
        }
        return o;
      });

      const remainingOrderIds = bundle.orderIds.filter((id) => id !== action.orderId);
      let newState: GameState = {
        ...state,
        orders: updatedOrders,
        bundledOrders: state.bundledOrders.map((b) =>
          b.id === orderToRemove.bundleId
            ? { ...b, status: 'cancelled' as const, orderIds: remainingOrderIds }
            : b
        ),
        player: {
          ...state.player,
          money: Math.max(0, state.player.money - penalty),
          reputation: Math.max(0, state.player.reputation - UNBUNDLE_REPUTATION_PENALTY),
          currentBundleId: null,
          currentOrderId: remainingOrderIds[0] || null,
        },
        plannedPath: [],
      };

      if (remainingOrderIds.length > 0) {
        const remainingOrder = newState.orders.find((o) => o.id === remainingOrderIds[0]);
        if (remainingOrder && remainingOrder.status === 'accepted') {
          const path = findPath(
            newState.vehicle.position.x,
            newState.vehicle.position.y,
            remainingOrder.pickupLocation.x,
            remainingOrder.pickupLocation.y,
            newState.map.roads,
            newState.map.gridSize
          );
          newState.plannedPath = path;
        } else if (remainingOrder && (remainingOrder.status === 'pickedup' || remainingOrder.status === 'delivering')) {
          const path = findPath(
            newState.vehicle.position.x,
            newState.vehicle.position.y,
            remainingOrder.deliveryLocation.x,
            remainingOrder.deliveryLocation.y,
            newState.map.roads,
            newState.map.gridSize
          );
          newState.plannedPath = path;
        }
      }

      return newState;
    }

    case 'ADVANCE_BUNDLE_STEP': {
      const bundle = state.bundledOrders.find((b) => b.id === state.player.currentBundleId);
      if (!bundle || bundle.status !== 'active') return state;

      const updatedSteps = bundle.steps.map((step, idx) =>
        idx === bundle.currentStepIndex ? { ...step, completed: true } : step
      );

      const nextStepIndex = bundle.currentStepIndex + 1;

      if (nextStepIndex >= bundle.steps.length) {
        return {
          ...state,
          bundledOrders: state.bundledOrders.map((b) =>
            b.id === bundle.id
              ? { ...b, steps: updatedSteps, status: 'completed' as const, currentStepIndex: nextStepIndex }
              : b
          ),
          player: { ...state.player, currentBundleId: null },
          plannedPath: [],
        };
      }

      const nextStep = bundle.steps[nextStepIndex];
      const path = findPath(
        state.vehicle.position.x,
        state.vehicle.position.y,
        nextStep.location.x,
        nextStep.location.y,
        state.map.roads,
        state.map.gridSize
      );

      const nextOrder = state.orders.find((o) => o.id === nextStep.orderId);
      if (nextOrder && nextStep.type === 'pickup' && nextOrder.status === 'accepted') {
        state.orders = state.orders.map((o) =>
          o.id === nextOrder.id ? { ...o, status: 'accepted' as const } : o
        );
      }

      return {
        ...state,
        bundledOrders: state.bundledOrders.map((b) =>
          b.id === bundle.id
            ? { ...b, steps: updatedSteps, currentStepIndex: nextStepIndex }
            : b
        ),
        player: { ...state.player, currentOrderId: nextStep.orderId },
        plannedPath: path,
      };
    }

    case 'UPDATE_RUSH_HOUR': {
      return {
        ...state,
        isRushHour: action.isRushHour,
      };
    }

    case 'START_CHARGING': {
      if (!isNearChargingStation(state.player.position, state.map.chargingStations)) return state;
      return { ...state, isCharging: true, isRepairing: false, isResting: false };
    }

    case 'STOP_CHARGING': {
      return { ...state, isCharging: false };
    }

    case 'START_REPAIRING': {
      if (!isNearRepairShop(state.player.position, state.map.repairShops)) return state;
      return { ...state, isRepairing: true, isCharging: false, isResting: false };
    }

    case 'STOP_REPAIRING': {
      return { ...state, isRepairing: false };
    }

    case 'START_RESTING': {
      return { ...state, isResting: true, isCharging: false, isRepairing: false };
    }

    case 'STOP_RESTING': {
      return { ...state, isResting: false };
    }

    case 'GENERATE_ORDERS': {
      const availableOrders = state.orders.filter((o) => o.status === 'available');
      if (availableOrders.length >= MAX_AVAILABLE_ORDERS) return state;

      const newOrder = generateOrder(
        state.map,
        state.player.position,
        state.gameTime,
        state.orders
      );

      if (!newOrder) return state;

      return { ...state, orders: [...state.orders, newOrder] };
    }

    case 'TICK': {
      if (state.isPaused || state.isGameOver) return state;

      let newState = {
        ...state,
        gameTime: state.gameTime + action.deltaTime,
      };

      newState.orders = updateOrderDeadlines(newState.orders, action.deltaTime);
      newState.weather = updateWeather(newState.weather, action.deltaTime);

      const rushHourStatus = isRushHour(newState.gameTime);
      if (rushHourStatus !== newState.isRushHour) {
        newState = gameReducer(newState, { type: 'UPDATE_RUSH_HOUR', isRushHour: rushHourStatus });
      }

      if (newState.isCharging) {
        const { vehicle, cost } = chargeVehicle(newState.vehicle, action.deltaTime);
        newState.vehicle = vehicle;
        newState.player = {
          ...newState.player,
          money: Math.max(0, newState.player.money - cost),
        };
        if (vehicle.battery >= vehicle.maxBattery) {
          newState.isCharging = false;
        }
      }

      if (newState.isRepairing) {
        const { vehicle, cost } = repairVehicle(newState.vehicle, action.deltaTime);
        newState.vehicle = vehicle;
        newState.player = {
          ...newState.player,
          money: Math.max(0, newState.player.money - cost),
        };
        if (vehicle.durability >= vehicle.maxDurability) {
          newState.isRepairing = false;
        }
      }

      if (newState.isResting) {
        const { stamina, cost } = restPlayer(
          newState.player.stamina,
          newState.player.maxStamina,
          action.deltaTime
        );
        newState.player = {
          ...newState.player,
          stamina,
          money: Math.max(0, newState.player.money - cost),
        };
        if (stamina >= newState.player.maxStamina) {
          newState.isResting = false;
        }
      }

      const currentBundle = newState.bundledOrders.find((b) => b.id === newState.player.currentBundleId);
      if (currentBundle && currentBundle.status === 'active') {
        const currentTarget = getCurrentBundleTarget(currentBundle);
        if (currentTarget && isAtLocation(newState.player.position, currentTarget.location, 50)) {
          if (currentTarget.type === 'pickup') {
            const order = newState.orders.find((o) => o.id === currentTarget.orderId);
            if (order && order.status === 'accepted') {
              newState = gameReducer(newState, { type: 'PICKUP_ORDER', orderId: order.id });
            }
          } else if (currentTarget.type === 'delivery') {
            const order = newState.orders.find((o) => o.id === currentTarget.orderId);
            if (order && (order.status === 'pickedup' || order.status === 'delivering')) {
              newState = gameReducer(newState, { type: 'DELIVER_ORDER', orderId: order.id });
              return newState;
            }
          }
          newState = gameReducer(newState, { type: 'ADVANCE_BUNDLE_STEP' });
        }
      } else {
        const currentOrder = newState.orders.find((o) => o.id === newState.player.currentOrderId);
        if (currentOrder && currentOrder.status === 'accepted') {
          if (isAtLocation(newState.player.position, currentOrder.pickupLocation, 50)) {
            newState = gameReducer(newState, { type: 'PICKUP_ORDER', orderId: currentOrder.id });
          }
        }
        if (currentOrder && (currentOrder.status === 'pickedup' || currentOrder.status === 'delivering')) {
          if (isAtLocation(newState.player.position, currentOrder.deliveryLocation, 50)) {
            newState = gameReducer(newState, { type: 'DELIVER_ORDER', orderId: currentOrder.id });
          }
        }
      }

      const failedOrders = newState.orders.filter((o) => o.status === 'failed' && o.id === newState.player.currentOrderId);
      if (failedOrders.length > 0) {
        newState.player = { ...newState.player, currentOrderId: null };
        newState.plannedPath = [];
      }

      if (newState.player.money < 0 && newState.player.stamina < 10 && newState.vehicle.battery < 10) {
        newState.isGameOver = true;
      }

      return newState;
    }

    case 'TOGGLE_PAUSE': {
      return { ...state, isPaused: !state.isPaused };
    }

    case 'CLOSE_SETTLEMENT': {
      return { ...state, showSettlement: false };
    }

    case 'PLAN_PATH': {
      return { ...state, plannedPath: action.path };
    }

    case 'CLEAR_PATH': {
      return { ...state, plannedPath: [] };
    }

    case 'NEW_GAME': {
      const newState = createInitialState();
      const initialOrders: typeof newState.orders = [];
      for (let i = 0; i < 3; i++) {
        const order = generateOrder(
          newState.map,
          newState.player.position,
          0,
          initialOrders
        );
        if (order) initialOrders.push(order);
      }
      return { ...newState, orders: initialOrders };
    }

    case 'LOAD_GAME': {
      const save = action.save;
      return {
        ...createInitialState(),
        player: save.player,
        vehicle: save.vehicle,
        weather: save.weather,
        orders: save.orders,
        incomeRecords: save.incomeRecords,
        gameTime: save.gameTime,
        map: save.map,
        bundledOrders: save.bundledOrders || [],
        bundlePreview: null,
        showBundlePreview: false,
        isRushHour: save.isRushHour !== undefined ? save.isRushHour : false,
      };
    }

    case 'GAME_OVER': {
      return { ...state, isGameOver: true };
    }

    default:
      return state;
  }
}

interface GameStore extends GameState {
  dispatch: (action: GameAction) => void;
  save: () => boolean;
  load: () => boolean;
  orderGenerationTimer: number;
}

export const useGameStore = create<GameStore>((set, get) => {
  const initialState = createInitialState();

  const initialOrders: typeof initialState.orders = [];
  for (let i = 0; i < 3; i++) {
    const order = generateOrder(
      initialState.map,
      initialState.player.position,
      0,
      initialOrders
    );
    if (order) initialOrders.push(order);
  }

  return {
    ...initialState,
    orders: initialOrders,
    orderGenerationTimer: 0,

    dispatch: (action) => {
      set((state) => gameReducer(state, action));
    },

    save: () => {
      const state = get();
      return saveGame(
        state.player,
        state.vehicle,
        state.weather,
        state.orders,
        state.incomeRecords,
        state.gameTime,
        state.map,
        state.bundledOrders,
        state.isRushHour
      );
    },

    load: () => {
      const save = loadGame();
      if (save) {
        set((state) => gameReducer(state, { type: 'LOAD_GAME', save }));
        return true;
      }
      return false;
    },
  };
});

export const selectCurrentOrder = (state: GameState): Order | null => {
  if (!state.player.currentOrderId) return null;
  return state.orders.find((o) => o.id === state.player.currentOrderId) || null;
};

export const selectAvailableOrders = (state: GameState): Order[] => {
  return state.orders.filter((o) => o.status === 'available');
};

export const selectCurrentBundle = (state: GameState) => {
  if (!state.player.currentBundleId) return null;
  return state.bundledOrders.find((b) => b.id === state.player.currentBundleId) || null;
};

export const selectBundleOrders = (state: GameState): Order[] => {
  const bundle = selectCurrentBundle(state);
  if (!bundle) return [];
  return state.orders.filter((o) => bundle.orderIds.includes(o.id));
};

export const selectBundleableOrders = (state: GameState): Order[] => {
  if (!state.player.currentOrderId || state.player.currentBundleId) return [];
  const currentOrder = state.orders.find((o) => o.id === state.player.currentOrderId);
  if (!currentOrder || currentOrder.status !== 'accepted') return [];
  
  return state.orders.filter((o) => 
    o.status === 'available' && 
    o.bundleId === null &&
    o.id !== currentOrder.id
  );
};

export const selectIsNearCharging = (state: GameState): boolean => {
  return isNearChargingStation(state.player.position, state.map.chargingStations);
};

export const selectIsNearRepair = (state: GameState): boolean => {
  return isNearRepairShop(state.player.position, state.map.repairShops);
};

export function useCurrentOrder(): Order | null {
  return useGameStore(selectCurrentOrder);
}

export function useAvailableOrders(): Order[] {
  return useGameStore(selectAvailableOrders);
}

export function useIsNearCharging(): boolean {
  return useGameStore(selectIsNearCharging);
}

export function useIsNearRepair(): boolean {
  return useGameStore(selectIsNearRepair);
}

export function useCurrentBundle() {
  return useGameStore(selectCurrentBundle);
}

export function useBundleOrders() {
  return useGameStore(useShallow(selectBundleOrders));
}

export function useBundleableOrders() {
  return useGameStore(useShallow(selectBundleableOrders));
}
