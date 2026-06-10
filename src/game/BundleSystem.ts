import { Order, BundlePreview, BundledOrder, BundleStep, Position, MapData } from './types';
import {
  GRID_SIZE,
  BUNDLE_PICKUP_DISTANCE_THRESHOLD,
  BUNDLE_DETOUR_RATIO_THRESHOLD,
  BUNDLE_BONUS_RATE,
  BUNDLE_RUSH_HOUR_BONUS_RATE,
  BUNDLE_TIME_ESTIMATE_PER_GRID,
} from './constants';
import { findPath } from './mapData';

export function calculateGridDistance(pos1: Position, pos2: Position): number {
  return Math.floor(Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y) / GRID_SIZE);
}

export function canBundleOrders(
  primaryOrder: Order,
  secondaryOrder: Order,
  _map: MapData,
  _playerPos: Position
): boolean {
  void _playerPos;
  if (primaryOrder.status !== 'accepted' || secondaryOrder.status !== 'available') {
    return false;
  }

  const pickupDistance = calculateGridDistance(
    primaryOrder.pickupLocation,
    secondaryOrder.pickupLocation
  );
  if (pickupDistance > BUNDLE_PICKUP_DISTANCE_THRESHOLD) {
    return false;
  }

  return true;
}

export function generateBundleSteps(primaryOrder: Order, secondaryOrder: Order): BundleStep[] {
  const pickup1Distance = calculateGridDistance(primaryOrder.pickupLocation, secondaryOrder.pickupLocation);
  const delivery1ToPickup2 = calculateGridDistance(primaryOrder.deliveryLocation, secondaryOrder.pickupLocation);
  const pickup1ToDelivery2 = calculateGridDistance(primaryOrder.pickupLocation, secondaryOrder.deliveryLocation);

  let steps: BundleStep[] = [];

  if (pickup1Distance <= delivery1ToPickup2 && pickup1Distance <= pickup1ToDelivery2) {
    steps = [
      {
        type: 'pickup',
        orderId: primaryOrder.id,
        location: { ...primaryOrder.pickupLocation },
        completed: false,
      },
      {
        type: 'pickup',
        orderId: secondaryOrder.id,
        location: { ...secondaryOrder.pickupLocation },
        completed: false,
      },
    ];

    const deliveryDistance1 = calculateGridDistance(secondaryOrder.pickupLocation, primaryOrder.deliveryLocation);
    const deliveryDistance2 = calculateGridDistance(secondaryOrder.pickupLocation, secondaryOrder.deliveryLocation);

    if (deliveryDistance1 <= deliveryDistance2) {
      steps.push(
        {
          type: 'delivery',
          orderId: primaryOrder.id,
          location: { ...primaryOrder.deliveryLocation },
          completed: false,
        },
        {
          type: 'delivery',
          orderId: secondaryOrder.id,
          location: { ...secondaryOrder.deliveryLocation },
          completed: false,
        }
      );
    } else {
      steps.push(
        {
          type: 'delivery',
          orderId: secondaryOrder.id,
          location: { ...secondaryOrder.deliveryLocation },
          completed: false,
        },
        {
          type: 'delivery',
          orderId: primaryOrder.id,
          location: { ...primaryOrder.deliveryLocation },
          completed: false,
        }
      );
    }
  } else {
    steps = [
      {
        type: 'pickup',
        orderId: primaryOrder.id,
        location: { ...primaryOrder.pickupLocation },
        completed: false,
      },
      {
        type: 'delivery',
        orderId: primaryOrder.id,
        location: { ...primaryOrder.deliveryLocation },
        completed: false,
      },
      {
        type: 'pickup',
        orderId: secondaryOrder.id,
        location: { ...secondaryOrder.pickupLocation },
        completed: false,
      },
      {
        type: 'delivery',
        orderId: secondaryOrder.id,
        location: { ...secondaryOrder.deliveryLocation },
        completed: false,
      },
    ];
  }

  return steps;
}

export function calculateBundleTotalDistance(steps: BundleStep[], map: MapData): number {
  if (steps.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    const path = findPath(
      steps[i].location.x,
      steps[i].location.y,
      steps[i + 1].location.x,
      steps[i + 1].location.y,
      map.roads,
      map.gridSize
    );
    totalDistance += path.length;
  }

  return totalDistance;
}

export function generateBundlePreview(
  primaryOrder: Order,
  secondaryOrder: Order,
  map: MapData,
  playerPos: Position,
  isRushHour: boolean
): BundlePreview | null {
  if (!canBundleOrders(primaryOrder, secondaryOrder, map, playerPos)) {
    return null;
  }

  const steps = generateBundleSteps(primaryOrder, secondaryOrder);

  const primarySinglePath = findPath(
    playerPos.x,
    playerPos.y,
    primaryOrder.deliveryLocation.x,
    primaryOrder.deliveryLocation.y,
    map.roads,
    map.gridSize
  );
  const primarySingleDistance = primarySinglePath.length;

  let bundleTotalDistance = 0;
  let lastPos = playerPos;
  for (const step of steps) {
    const path = findPath(
      lastPos.x,
      lastPos.y,
      step.location.x,
      step.location.y,
      map.roads,
      map.gridSize
    );
    bundleTotalDistance += path.length;
    lastPos = step.location;
  }

  const extraDistance = Math.max(0, bundleTotalDistance - primarySingleDistance);
  const extraTime = extraDistance * BUNDLE_TIME_ESTIMATE_PER_GRID;

  const bonusRate = isRushHour ? BUNDLE_RUSH_HOUR_BONUS_RATE : BUNDLE_BONUS_RATE;
  const baseExtraReward = Math.floor(secondaryOrder.reward * bonusRate);
  const extraReward = secondaryOrder.reward + baseExtraReward;
  const totalReward = primaryOrder.reward + extraReward;

  let atRiskOrderId: string | null = null;
  let atRiskMinutes = 0;

  const primaryTimeNeeded = calculateTimeToStep(steps, 0, playerPos, map) +
    calculateTimeToStep(steps, steps.findIndex(s => s.type === 'delivery' && s.orderId === primaryOrder.id), playerPos, map);
  const secondaryTimeNeeded = calculateTimeToStep(steps, steps.findIndex(s => s.type === 'delivery' && s.orderId === secondaryOrder.id), playerPos, map);

  if (primaryTimeNeeded > primaryOrder.deadline) {
    atRiskOrderId = primaryOrder.id;
    atRiskMinutes = Math.ceil((primaryTimeNeeded - primaryOrder.deadline) / 60);
  } else if (secondaryTimeNeeded > secondaryOrder.deadline) {
    atRiskOrderId = secondaryOrder.id;
    atRiskMinutes = Math.ceil((secondaryTimeNeeded - secondaryOrder.deadline) / 60);
  }

  return {
    bundleId: `bundle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    primaryOrderId: primaryOrder.id,
    secondaryOrderId: secondaryOrder.id,
    extraDistance,
    extraTime,
    extraReward,
    atRiskOrderId,
    atRiskMinutes,
    totalReward,
    steps,
    isRushHour,
  };
}

function calculateTimeToStep(steps: BundleStep[], targetStepIndex: number, startPos: Position, map: MapData): number {
  if (targetStepIndex < 0) return 0;

  let totalDistance = 0;
  let lastPos = startPos;

  for (let i = 0; i <= targetStepIndex; i++) {
    const path = findPath(
      lastPos.x,
      lastPos.y,
      steps[i].location.x,
      steps[i].location.y,
      map.roads,
      map.gridSize
    );
    totalDistance += path.length;
    lastPos = steps[i].location;
  }

  return totalDistance * BUNDLE_TIME_ESTIMATE_PER_GRID;
}

export function createBundledOrder(preview: BundlePreview, gameTime: number): BundledOrder {
  return {
    id: preview.bundleId,
    orderIds: [preview.primaryOrderId, preview.secondaryOrderId],
    status: 'active',
    currentStepIndex: 0,
    steps: preview.steps.map(s => ({ ...s, completed: false })),
    createdAt: gameTime,
  };
}

export function getCurrentBundleTarget(bundle: BundledOrder): BundleStep | null {
  if (bundle.currentStepIndex >= bundle.steps.length) return null;
  return bundle.steps[bundle.currentStepIndex];
}

export function getBundleOrdersByIds(orders: Order[], orderIds: string[]): Order[] {
  return orderIds.map(id => orders.find(o => o.id === id)).filter((o): o is Order => o !== undefined);
}

export function isRushHour(gameTime: number): boolean {
  const hours = Math.floor(gameTime / 3600);
  const minutes = Math.floor((gameTime % 3600) / 60);
  const totalMinutes = hours * 60 + minutes;
  
  const rushStart = 17 * 60 + 30;
  const rushEnd = 19 * 60 + 30;
  
  return totalMinutes >= rushStart && totalMinutes <= rushEnd;
}

export function formatRushHourTime(gameTime: number): string {
  const hours = Math.floor(gameTime / 3600);
  const minutes = Math.floor((gameTime % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
