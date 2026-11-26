use glam::Vec3;

#[derive(Default)]
pub struct Bounds {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

impl Bounds {
    pub fn is_valid(&self) -> bool {
        self.min.iter().zip(self.max).all(|(&lo, hi)| lo.is_finite() && hi.is_finite() && lo <= hi)
    }

    pub fn center(&self) -> [f32; 3] {
        ((Vec3::from(self.min) + Vec3::from(self.max)) * 0.5).into()
    }

    pub fn radius(&self) -> f32 {
        Vec3::from(self.min).distance(Vec3::from(self.max)) * 0.5
    }
}
