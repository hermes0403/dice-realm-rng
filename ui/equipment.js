/** Composition facade for the independently initialized glove, item, and potion UIs. */
import { createGloveUI } from './gloves.js?v=20261123-t0126-time-crystal-material-deposit';
import { createPotionUI } from './potions.js?v=20261121-t0123-money-potions';

export function createEquipmentUI(deps) {
  const gloves = createGloveUI(deps);
  const potions = createPotionUI(deps);
  return {
    canCraft: gloves.canCraft,
    renderGloves: gloves.renderGloves,
    purchaseGlove: gloves.purchaseGlove,
    craft: gloves.craft,
    potionMaterialTotal: potions.potionMaterialTotal,
    renderPotionAutoAddChoices: potions.renderPotionAutoAddChoices,
    potionIngredientInfo: potions.potionIngredientInfo,
    renderPotions: potions.renderPotions,
    craftPotion: potions.craftPotion,
    usePotion: potions.usePotion,
    setupEquipmentUI() {
      gloves.setupGloveUI();
      potions.setupPotionUI();
    }
  };
}