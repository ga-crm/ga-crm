import { Column, Entity, PrimaryColumn } from 'typeorm';

/** TENANT-5 + section 19.9: one DLVN product, shared by every GA. */
@Entity('products')
export class Product {
  @PrimaryColumn({ type: 'text' }) productCode: string;
  @Column({ type: 'text' }) productName: string;
  @Column({ type: 'text' }) productRole: 'Chính' | 'Bổ trợ';
  @Column({ type: 'text', nullable: true }) category: string | null;
  @Column({ type: 'integer', nullable: true }) minEntryAge: number | null;
  @Column({ type: 'integer', nullable: true }) maxEntryAge: number | null;
  @Column({ type: 'integer', nullable: true }) maxCoverAge: number | null;
  @Column({ type: 'text', nullable: true }) gender: string | null;
  @Column({ type: 'text', nullable: true }) waitingPeriod: string | null;
  @Column({ type: 'text', nullable: true }) keyBenefits: string | null;
  @Column({ type: 'text', nullable: true }) fitRule: string | null;
  @Column({ type: 'text', nullable: true }) triggerEvent: string | null;
  @Column({ type: 'text' }) ruleStatus: 'DRAFT' | 'APPROVED';
  @Column({ type: 'boolean' }) active: boolean;
  @Column({ type: 'text' }) nameNorm: string;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'uuid', nullable: true }) updatedBy: string | null;
}

/** What a GA user sees of a product: no matching rules (section 19.9 keeps those for later). */
export type ProductView = Pick<
  Product,
  | 'productCode'
  | 'productName'
  | 'productRole'
  | 'category'
  | 'minEntryAge'
  | 'maxEntryAge'
  | 'maxCoverAge'
  | 'gender'
  | 'waitingPeriod'
  | 'keyBenefits'
  | 'active'
>;

export const toProductView = (product: Product): ProductView => ({
  productCode: product.productCode,
  productName: product.productName,
  productRole: product.productRole,
  category: product.category,
  minEntryAge: product.minEntryAge,
  maxEntryAge: product.maxEntryAge,
  maxCoverAge: product.maxCoverAge,
  gender: product.gender,
  waitingPeriod: product.waitingPeriod,
  keyBenefits: product.keyBenefits,
  active: product.active,
});
